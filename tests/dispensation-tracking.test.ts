import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const doctor1 = accounts.get("wallet_1")!;
const pharmacy1 = accounts.get("wallet_2")!;
const pharmacy2 = accounts.get("wallet_3")!;
const patient1 = accounts.get("wallet_4")!;
const patient2 = accounts.get("wallet_5")!;

describe("Dispensation Tracking Contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
    
    // Setup: Authorize doctor
    simnet.callPublicFn(
      "prescription-registry",
      "authorize-doctor",
      [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
      deployer
    );

    // Setup: Register and verify pharmacy
    simnet.callPublicFn(
      "pharmacy-registry",
      "register-pharmacy",
      [
        Cl.stringAscii("City Pharmacy"),
        Cl.principal(pharmacy1),
        Cl.stringAscii("PHARM123456"),
        Cl.stringAscii("Located downtown")
      ],
      deployer
    );

    simnet.callPublicFn(
      "pharmacy-registry",
      "verify-pharmacy",
      [Cl.uint(1)],
      deployer
    );

    // Setup: Issue a prescription
    const validUntil = simnet.blockHeight + 1000;
    simnet.callPublicFn(
      "prescription-registry",
      "issue-prescription",
      [
        Cl.principal(patient1),
        Cl.stringAscii("Amoxicillin"),
        Cl.stringAscii("500mg twice daily"),
        Cl.uint(3),
        Cl.uint(validUntil)
      ],
      doctor1
    );
  });

  describe("Dispensation Recording", () => {
    it("should allow verified pharmacy to record dispensation", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1), // prescription ID
          Cl.principal(patient1),
          Cl.uint(30), // quantity
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );

      expect(result).toBeOk(Cl.uint(1)); // First dispensation ID

      // Verify dispensation was recorded
      const { result: dispensation } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-dispensation",
        [Cl.uint(1)],
        deployer
      );

      expect(dispensation).toBeSome();
    });

    it("should not allow unverified pharmacy to record dispensation", () => {
      // Register but don't verify pharmacy2
      simnet.callPublicFn(
        "pharmacy-registry",
        "register-pharmacy",
        [
          Cl.stringAscii("Another Pharmacy"),
          Cl.principal(pharmacy2),
          Cl.stringAscii("PHARM789012"),
          Cl.stringAscii("Different location")
        ],
        deployer
      );

      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30),
          Cl.stringAscii("BATCH001")
        ],
        pharmacy2
      );

      expect(result).toBeErr(Cl.uint(101)); // err-pharmacy-not-verified
    });

    it("should not allow dispensation for invalid prescription", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(999), // Non-existent prescription
          Cl.principal(patient1),
          Cl.uint(30),
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(300)); // err-prescription-not-found
    });

    it("should not allow dispensation to wrong patient", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient2), // Wrong patient
          Cl.uint(30),
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(102)); // err-not-prescription-patient
    });

    it("should validate dispensation parameters", () => {
      // Test invalid quantity (too low)
      const { result: lowQuantity } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(0), // Invalid quantity
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );

      expect(lowQuantity).toBeErr(Cl.uint(201)); // err-invalid-quantity

      // Test invalid quantity (too high)
      const { result: highQuantity } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(1001), // Too high
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );

      expect(highQuantity).toBeErr(Cl.uint(201)); // err-invalid-quantity

      // Test invalid batch number (too short)
      const { result: shortBatch } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30),
          Cl.stringAscii("BA") // Too short
        ],
        pharmacy1
      );

      expect(shortBatch).toBeErr(Cl.uint(202)); // err-invalid-batch-number
    });

    it("should update dispensation statistics", () => {
      // Record first dispensation
      simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30),
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );

      // Check prescription dispensation stats
      const { result: stats } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-prescription-dispensation-stats",
        [Cl.uint(1)],
        deployer
      );

      expect(stats).toBeTuple({
        count: Cl.uint(1),
        "total-quantity": Cl.uint(30),
        "last-dispensation": Cl.uint(simnet.blockHeight)
      });

      // Record second dispensation
      simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(20),
          Cl.stringAscii("BATCH002")
        ],
        pharmacy1
      );

      // Check updated stats
      const { result: updatedStats } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-prescription-dispensation-stats",
        [Cl.uint(1)],
        deployer
      );

      expect(updatedStats).toBeTuple({
        count: Cl.uint(2),
        "total-quantity": Cl.uint(50),
        "last-dispensation": Cl.uint(simnet.blockHeight)
      });
    });
  });

  describe("Dispensation History Access", () => {
    beforeEach(() => {
      // Record a dispensation for testing
      simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30),
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );
    });

    it("should allow admin to access dispensation history", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "get-prescription-dispensation-history",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk();
    });

    it("should allow patient to access their own dispensation history", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "get-prescription-dispensation-history",
        [Cl.uint(1)],
        patient1
      );

      expect(result).toBeOk();
    });

    it("should not allow unauthorized user to access dispensation history", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "get-prescription-dispensation-history",
        [Cl.uint(1)],
        patient2 // Different patient
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow pharmacy to access dispensation history", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "get-prescription-dispensation-history",
        [Cl.uint(1)],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });
  });

  describe("Read-Only Functions", () => {
    beforeEach(() => {
      // Record dispensations for testing
      simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30),
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );
    });

    it("should return dispensation details", () => {
      const { result } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-dispensation",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return patient dispensation stats", () => {
      const { result } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-patient-dispensation-stats",
        [Cl.principal(patient1), Cl.uint(1)],
        deployer
      );

      expect(result).toBeTuple({
        "dispensation-count": Cl.uint(1),
        "last-dispensation-id": Cl.uint(1)
      });
    });

    it("should return correct dispensation counter", () => {
      const { result } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-dispensation-counter",
        [],
        deployer
      );

      expect(result).toBe(Cl.uint(1));
    });

    it("should return contract status", () => {
      const { result } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-contract-status",
        [],
        deployer
      );

      expect(result).toBeTuple({
        active: Cl.bool(true),
        "dispensation-count": Cl.uint(1),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should check if prescription can be dispensed", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "can-dispense-prescription",
        [Cl.uint(1), Cl.principal(pharmacy1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should return false for invalid prescription dispensation check", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "can-dispense-prescription",
        [Cl.uint(999), Cl.principal(pharmacy1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(false));
    });

    it("should return none for non-existent dispensation", () => {
      const { result } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-dispensation",
        [Cl.uint(999)],
        deployer
      );

      expect(result).toBeNone();
    });
  });

  describe("Emergency Controls", () => {
    it("should allow admin to emergency stop contract", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "emergency-stop",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is stopped
      const { result: status } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(false),
        "dispensation-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should not allow non-admin to emergency stop", () => {
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "emergency-stop",
        [],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should allow admin to resume contract", () => {
      // First stop
      simnet.callPublicFn(
        "dispensation-tracking",
        "emergency-stop",
        [],
        deployer
      );

      // Then resume
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "resume-contract",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is active
      const { result: status } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(true),
        "dispensation-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should prevent operations when contract is stopped", () => {
      // Stop contract
      simnet.callPublicFn(
        "dispensation-tracking",
        "emergency-stop",
        [],
        deployer
      );

      // Try to record dispensation
      const { result } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30),
          Cl.stringAscii("BATCH001")
        ],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(400)); // Contract stopped error
    });
  });
});
