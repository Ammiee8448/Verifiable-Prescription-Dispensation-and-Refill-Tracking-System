import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const doctor1 = accounts.get("wallet_1")!;
const pharmacy1 = accounts.get("wallet_2")!;
const patient1 = accounts.get("wallet_3")!;
const patient2 = accounts.get("wallet_4")!;

describe("Refill Management Contract", () => {
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

    // Setup: Issue a prescription with refills
    const validUntil = simnet.blockHeight + 1000;
    simnet.callPublicFn(
      "prescription-registry",
      "issue-prescription",
      [
        Cl.principal(patient1),
        Cl.stringAscii("Amoxicillin"),
        Cl.stringAscii("500mg twice daily"),
        Cl.uint(3), // 3 refills
        Cl.uint(validUntil)
      ],
      doctor1
    );

    // Setup: Initialize refill rights
    simnet.callPublicFn(
      "refill-management",
      "initialize-refill-rights",
      [Cl.uint(1), Cl.principal(patient1), Cl.uint(3)],
      deployer // This should be called by prescription-registry contract
    );
  });

  describe("Refill Rights Initialization", () => {
    it("should allow prescription registry to initialize refill rights", () => {
      // Issue another prescription
      const validUntil = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        "prescription-registry",
        "issue-prescription",
        [
          Cl.principal(patient2),
          Cl.stringAscii("Ibuprofen"),
          Cl.stringAscii("200mg as needed"),
          Cl.uint(2),
          Cl.uint(validUntil)
        ],
        doctor1
      );

      const { result } = simnet.callPublicFn(
        "refill-management",
        "initialize-refill-rights",
        [Cl.uint(2), Cl.principal(patient2), Cl.uint(2)],
        deployer // Simulating prescription-registry contract call
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify refill rights were created
      const { result: refillRights } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-rights",
        [Cl.uint(2)],
        deployer
      );

      expect(refillRights).toBeSome();
    });

    it("should not allow unauthorized caller to initialize refill rights", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "initialize-refill-rights",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(3)],
        pharmacy1 // Not prescription registry
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });
  });

  describe("Refill Processing", () => {
    it("should allow verified pharmacy to process refill", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [
          Cl.uint(1), // prescription ID
          Cl.principal(patient1),
          Cl.uint(30) // quantity
        ],
        pharmacy1
      );

      expect(result).toBeOk(Cl.uint(1)); // First refill ID

      // Verify refill rights were updated
      const { result: refillRights } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-rights",
        [Cl.uint(1)],
        deployer
      );

      expect(refillRights).toBeSome();
      // Should have 2 remaining refills (3 - 1)
    });

    it("should not allow unverified pharmacy to process refill", () => {
      // Register but don't verify another pharmacy
      const pharmacy2 = accounts.get("wallet_5")!;
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
        "refill-management",
        "process-refill",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30)
        ],
        pharmacy2
      );

      expect(result).toBeErr(Cl.uint(102)); // err-pharmacy-not-verified
    });

    it("should not allow refill for wrong patient", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [
          Cl.uint(1),
          Cl.principal(patient2), // Wrong patient
          Cl.uint(30)
        ],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(101)); // err-not-prescription-patient
    });

    it("should validate refill parameters", () => {
      // Test invalid quantity (too low)
      const { result: lowQuantity } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(0) // Invalid quantity
        ],
        pharmacy1
      );

      expect(lowQuantity).toBeErr(Cl.uint(201)); // err-invalid-quantity

      // Test invalid quantity (too high)
      const { result: highQuantity } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(1001) // Too high
        ],
        pharmacy1
      );

      expect(highQuantity).toBeErr(Cl.uint(201)); // err-invalid-quantity
    });

    it("should prevent refill when no refills remaining", () => {
      // Use up all refills
      simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );

      simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );

      simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );

      // Fourth refill should fail
      const { result } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(303)); // err-no-refills-remaining
    });

    it("should update patient statistics", () => {
      // Process a refill
      simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );

      // Check patient stats
      const { result: stats } = simnet.callReadOnlyFn(
        "refill-management",
        "get-patient-refill-stats",
        [Cl.principal(patient1)],
        deployer
      );

      expect(stats).toBeTuple({
        "total-refills": Cl.uint(1),
        "active-prescriptions": Cl.uint(1),
        "last-refill": Cl.uint(simnet.blockHeight)
      });
    });
  });

  describe("Refill Rights Management", () => {
    it("should allow admin to deactivate refill rights", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "deactivate-refill-rights",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify refill rights are deactivated
      const { result: canRefill } = simnet.callPublicFn(
        "refill-management",
        "can-refill-prescription",
        [Cl.uint(1)],
        deployer
      );

      expect(canRefill).toBeOk(Cl.bool(false));
    });

    it("should not allow unauthorized user to deactivate refill rights", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "deactivate-refill-rights",
        [Cl.uint(1)],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow deactivating already inactive refill rights", () => {
      // First deactivation
      simnet.callPublicFn(
        "refill-management",
        "deactivate-refill-rights",
        [Cl.uint(1)],
        deployer
      );

      // Second deactivation should fail
      const { result } = simnet.callPublicFn(
        "refill-management",
        "deactivate-refill-rights",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(305)); // err-refill-rights-inactive
    });
  });

  describe("Patient History Access", () => {
    beforeEach(() => {
      // Process a refill for testing
      simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );
    });

    it("should allow patient to access their own refill history", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "get-patient-refill-history",
        [Cl.principal(patient1)],
        patient1
      );

      expect(result).toBeOk();
    });

    it("should allow admin to access any patient refill history", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "get-patient-refill-history",
        [Cl.principal(patient1)],
        deployer
      );

      expect(result).toBeOk();
    });

    it("should not allow other patients to access refill history", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "get-patient-refill-history",
        [Cl.principal(patient1)],
        patient2
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow pharmacy to access patient refill history", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "get-patient-refill-history",
        [Cl.principal(patient1)],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });
  });

  describe("Read-Only Functions", () => {
    beforeEach(() => {
      // Process a refill for testing
      simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );
    });

    it("should return refill rights", () => {
      const { result } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-rights",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return refill history", () => {
      const { result } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-history",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return correct refill counter", () => {
      const { result } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-counter",
        [],
        deployer
      );

      expect(result).toBe(Cl.uint(1));
    });

    it("should return contract status", () => {
      const { result } = simnet.callReadOnlyFn(
        "refill-management",
        "get-contract-status",
        [],
        deployer
      );

      expect(result).toBeTuple({
        active: Cl.bool(true),
        "refill-count": Cl.uint(1),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should check if prescription can be refilled", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "can-refill-prescription",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true)); // Should still have refills remaining
    });

    it("should return none for non-existent refill rights", () => {
      const { result } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-rights",
        [Cl.uint(999)],
        deployer
      );

      expect(result).toBeNone();
    });
  });

  describe("Emergency Controls", () => {
    it("should allow admin to emergency stop contract", () => {
      const { result } = simnet.callPublicFn(
        "refill-management",
        "emergency-stop",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is stopped
      const { result: status } = simnet.callReadOnlyFn(
        "refill-management",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(false),
        "refill-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should prevent operations when contract is stopped", () => {
      // Stop contract
      simnet.callPublicFn(
        "refill-management",
        "emergency-stop",
        [],
        deployer
      );

      // Try to process refill
      const { result } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(400)); // Contract stopped error
    });
  });
});
