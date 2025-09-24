import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const doctor1 = accounts.get("wallet_1")!;
const doctor2 = accounts.get("wallet_2")!;
const patient1 = accounts.get("wallet_3")!;
const patient2 = accounts.get("wallet_4")!;

describe("Prescription Registry Contract", () => {
  beforeEach(() => {
    // Reset the simnet state before each test
    simnet.setEpoch("3.0");
  });

  describe("Doctor Authorization", () => {
    it("should allow admin to authorize a doctor", () => {
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify doctor is authorized
      const { result: isAuthorized } = simnet.callReadOnlyFn(
        "prescription-registry",
        "is-doctor-authorized",
        [Cl.principal(doctor1)],
        deployer
      );

      expect(isAuthorized).toBe(Cl.bool(true));
    });

    it("should not allow non-admin to authorize a doctor", () => {
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        doctor1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow authorizing the same doctor twice", () => {
      // First authorization
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );

      // Second authorization should fail
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC789012")],
        deployer
      );

      expect(result).toBeErr(Cl.uint(102)); // err-doctor-already-authorized
    });

    it("should allow admin to revoke doctor authorization", () => {
      // First authorize
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );

      // Then revoke
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "revoke-doctor",
        [Cl.principal(doctor1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify doctor is no longer authorized
      const { result: isAuthorized } = simnet.callReadOnlyFn(
        "prescription-registry",
        "is-doctor-authorized",
        [Cl.principal(doctor1)],
        deployer
      );

      expect(isAuthorized).toBe(Cl.bool(false));
    });

    it("should validate license number length", () => {
      // Too short license number
      const { result: shortLicense } = simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC")],
        deployer
      );

      expect(shortLicense).toBeErr(Cl.uint(206)); // err-empty-license-number
    });
  });

  describe("Prescription Issuance", () => {
    beforeEach(() => {
      // Authorize a doctor for prescription tests
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );
    });

    it("should allow authorized doctor to issue prescription", () => {
      const validUntil = simnet.blockHeight + 1000;
      
      const { result } = simnet.callPublicFn(
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

      expect(result).toBeOk(Cl.uint(1)); // First prescription ID

      // Verify prescription details
      const { result: prescription } = simnet.callReadOnlyFn(
        "prescription-registry",
        "get-prescription",
        [Cl.uint(1)],
        deployer
      );

      expect(prescription).toBeSome();
    });

    it("should not allow unauthorized doctor to issue prescription", () => {
      const validUntil = simnet.blockHeight + 1000;
      
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "issue-prescription",
        [
          Cl.principal(patient1),
          Cl.stringAscii("Amoxicillin"),
          Cl.stringAscii("500mg twice daily"),
          Cl.uint(3),
          Cl.uint(validUntil)
        ],
        doctor2 // Not authorized
      );

      expect(result).toBeErr(Cl.uint(101)); // err-doctor-not-authorized
    });

    it("should validate prescription parameters", () => {
      const validUntil = simnet.blockHeight + 1000;

      // Test invalid drug name (empty)
      const { result: emptyDrug } = simnet.callPublicFn(
        "prescription-registry",
        "issue-prescription",
        [
          Cl.principal(patient1),
          Cl.stringAscii(""),
          Cl.stringAscii("500mg twice daily"),
          Cl.uint(3),
          Cl.uint(validUntil)
        ],
        doctor1
      );

      expect(emptyDrug).toBeErr(Cl.uint(202)); // err-invalid-drug-name

      // Test invalid refills (too many)
      const { result: tooManyRefills } = simnet.callPublicFn(
        "prescription-registry",
        "issue-prescription",
        [
          Cl.principal(patient1),
          Cl.stringAscii("Amoxicillin"),
          Cl.stringAscii("500mg twice daily"),
          Cl.uint(15), // Max is 10
          Cl.uint(validUntil)
        ],
        doctor1
      );

      expect(tooManyRefills).toBeErr(Cl.uint(204)); // err-invalid-refills

      // Test invalid validity period (in the past)
      const { result: pastValidity } = simnet.callPublicFn(
        "prescription-registry",
        "issue-prescription",
        [
          Cl.principal(patient1),
          Cl.stringAscii("Amoxicillin"),
          Cl.stringAscii("500mg twice daily"),
          Cl.uint(3),
          Cl.uint(simnet.blockHeight - 1) // Past block
        ],
        doctor1
      );

      expect(pastValidity).toBeErr(Cl.uint(205)); // err-invalid-validity-period
    });

    it("should not allow doctor to prescribe to themselves", () => {
      const validUntil = simnet.blockHeight + 1000;
      
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "issue-prescription",
        [
          Cl.principal(doctor1), // Doctor prescribing to themselves
          Cl.stringAscii("Amoxicillin"),
          Cl.stringAscii("500mg twice daily"),
          Cl.uint(3),
          Cl.uint(validUntil)
        ],
        doctor1
      );

      expect(result).toBeErr(Cl.uint(201)); // err-invalid-patient
    });
  });

  describe("Prescription Management", () => {
    beforeEach(() => {
      // Authorize doctor and issue a prescription
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );

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

    it("should allow doctor to deactivate their own prescription", () => {
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "deactivate-prescription",
        [Cl.uint(1)],
        doctor1
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify prescription is no longer valid
      const { result: isValid } = simnet.callReadOnlyFn(
        "prescription-registry",
        "is-prescription-valid",
        [Cl.uint(1)],
        deployer
      );

      expect(isValid).toBe(Cl.bool(false));
    });

    it("should allow admin to deactivate any prescription", () => {
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "deactivate-prescription",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should not allow unauthorized user to deactivate prescription", () => {
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "deactivate-prescription",
        [Cl.uint(1)],
        patient1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });
  });

  describe("Emergency Controls", () => {
    it("should allow admin to emergency stop contract", () => {
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "emergency-stop",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract status
      const { result: status } = simnet.callReadOnlyFn(
        "prescription-registry",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(false),
        "prescription-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should not allow non-admin to emergency stop", () => {
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "emergency-stop",
        [],
        doctor1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should allow admin to resume contract after emergency stop", () => {
      // First stop
      simnet.callPublicFn(
        "prescription-registry",
        "emergency-stop",
        [],
        deployer
      );

      // Then resume
      const { result } = simnet.callPublicFn(
        "prescription-registry",
        "resume-contract",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is active again
      const { result: status } = simnet.callReadOnlyFn(
        "prescription-registry",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(true),
        "prescription-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });
  });

  describe("Read-Only Functions", () => {
    beforeEach(() => {
      // Setup test data
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );
    });

    it("should return correct doctor information", () => {
      const { result } = simnet.callReadOnlyFn(
        "prescription-registry",
        "get-doctor-info",
        [Cl.principal(doctor1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return correct prescription counter", () => {
      const { result } = simnet.callReadOnlyFn(
        "prescription-registry",
        "get-prescription-counter",
        [],
        deployer
      );

      expect(result).toBe(Cl.uint(0)); // No prescriptions issued yet
    });

    it("should return none for non-existent prescription", () => {
      const { result } = simnet.callReadOnlyFn(
        "prescription-registry",
        "get-prescription",
        [Cl.uint(999)],
        deployer
      );

      expect(result).toBeNone();
    });
  });
});
