import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const doctor1 = accounts.get("wallet_1")!;
const pharmacy1 = accounts.get("wallet_2")!;
const patient1 = accounts.get("wallet_3")!;
const auditor1 = accounts.get("wallet_4")!;

describe("Integration Tests - Full Prescription Workflow", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("Complete Prescription Lifecycle", () => {
    it("should handle complete prescription workflow from issuance to refill", () => {
      // Step 1: Setup - Authorize doctor
      const { result: doctorAuth } = simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );
      expect(doctorAuth).toBeOk(Cl.bool(true));

      // Step 2: Setup - Register and verify pharmacy
      const { result: pharmacyReg } = simnet.callPublicFn(
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
      expect(pharmacyReg).toBeOk(Cl.uint(1));

      const { result: pharmacyVerify } = simnet.callPublicFn(
        "pharmacy-registry",
        "verify-pharmacy",
        [Cl.uint(1)],
        deployer
      );
      expect(pharmacyVerify).toBeOk(Cl.bool(true));

      // Step 3: Doctor issues prescription
      const validUntil = simnet.blockHeight + 1000;
      const { result: prescriptionIssue } = simnet.callPublicFn(
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
      expect(prescriptionIssue).toBeOk(Cl.uint(1));

      // Step 4: Initialize refill rights (simulating prescription registry calling refill management)
      const { result: refillInit } = simnet.callPublicFn(
        "refill-management",
        "initialize-refill-rights",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(3)],
        deployer // Simulating prescription-registry contract
      );
      expect(refillInit).toBeOk(Cl.bool(true));

      // Step 5: Pharmacy dispenses initial prescription
      const { result: initialDispense } = simnet.callPublicFn(
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
      expect(initialDispense).toBeOk(Cl.uint(1));

      // Step 6: Process first refill
      const { result: firstRefill } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30)
        ],
        pharmacy1
      );
      expect(firstRefill).toBeOk(Cl.uint(1));

      // Step 7: Verify refill rights were updated
      const { result: refillRights } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-rights",
        [Cl.uint(1)],
        deployer
      );
      expect(refillRights).toBeSome();

      // Step 8: Verify dispensation stats were updated
      const { result: dispenseStats } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-prescription-dispensation-stats",
        [Cl.uint(1)],
        deployer
      );
      expect(dispenseStats).toBeTuple({
        count: Cl.uint(2), // Initial + 1 refill
        "total-quantity": Cl.uint(60),
        "last-dispensation": Cl.uint(simnet.blockHeight)
      });

      // Step 9: Process remaining refills
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

      // Step 10: Verify no more refills can be processed
      const { result: noMoreRefills } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );
      expect(noMoreRefills).toBeErr(Cl.uint(303)); // err-no-refills-remaining
    });

    it("should handle audit workflow", () => {
      // Step 1: Register auditor
      const { result: auditorReg } = simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("REGULATOR"),
          Cl.uint(10)
        ],
        deployer
      );
      expect(auditorReg).toBeOk(Cl.bool(true));

      // Step 2: Submit audit report
      const { result: auditReport } = simnet.callPublicFn(
        "audit-dao",
        "submit-audit-report",
        [
          Cl.stringAscii("prescription-registry"),
          Cl.stringAscii("Comprehensive audit of prescription issuance process completed. All security measures are functioning correctly."),
          Cl.stringAscii("LOW")
        ],
        auditor1
      );
      expect(auditReport).toBeOk(Cl.uint(1));

      // Step 3: Create governance proposal
      const deadline = simnet.blockHeight + 1000;
      const { result: proposal } = simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Update Prescription Limits"),
          Cl.stringAscii("Proposal to update the maximum refill limits from 10 to 12 for chronic medications."),
          Cl.uint(deadline),
          Cl.stringAscii("POLICY")
        ],
        auditor1
      );
      expect(proposal).toBeOk(Cl.uint(1));

      // Step 4: Vote on proposal
      const { result: vote } = simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(1), Cl.bool(true)],
        auditor1
      );
      expect(vote).toBeOk(Cl.bool(true));
    });
  });

  describe("Cross-Contract Validation", () => {
    beforeEach(() => {
      // Setup basic entities
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );

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

    it("should validate prescription exists before dispensation", () => {
      // Try to dispense non-existent prescription
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

    it("should validate pharmacy verification before dispensation", () => {
      // Register but don't verify another pharmacy
      const pharmacy2 = accounts.get("wallet_5")!;
      simnet.callPublicFn(
        "pharmacy-registry",
        "register-pharmacy",
        [
          Cl.stringAscii("Unverified Pharmacy"),
          Cl.principal(pharmacy2),
          Cl.stringAscii("PHARM789012"),
          Cl.stringAscii("Not verified")
        ],
        deployer
      );

      // Try to dispense with unverified pharmacy
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

    it("should validate patient matches prescription", () => {
      const patient2 = accounts.get("wallet_6")!;
      
      // Try to dispense to wrong patient
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

    it("should check prescription validity for refills", () => {
      // Initialize refill rights
      simnet.callPublicFn(
        "refill-management",
        "initialize-refill-rights",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(3)],
        deployer
      );

      // Deactivate prescription
      simnet.callPublicFn(
        "prescription-registry",
        "deactivate-prescription",
        [Cl.uint(1)],
        doctor1
      );

      // Try to process refill on deactivated prescription
      const { result } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [
          Cl.uint(1),
          Cl.principal(patient1),
          Cl.uint(30)
        ],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(301)); // err-prescription-expired (inactive)
    });
  });

  describe("Emergency Scenarios", () => {
    it("should handle emergency stop across all contracts", () => {
      // Stop all contracts
      simnet.callPublicFn("prescription-registry", "emergency-stop", [], deployer);
      simnet.callPublicFn("pharmacy-registry", "emergency-stop", [], deployer);
      simnet.callPublicFn("dispensation-tracking", "emergency-stop", [], deployer);
      simnet.callPublicFn("refill-management", "emergency-stop", [], deployer);
      simnet.callPublicFn("audit-dao", "emergency-stop", [], deployer);

      // Verify all contracts are stopped
      const contracts = [
        "prescription-registry",
        "pharmacy-registry", 
        "dispensation-tracking",
        "refill-management",
        "audit-dao"
      ];

      for (const contract of contracts) {
        const { result } = simnet.callReadOnlyFn(
          contract,
          "get-contract-status",
          [],
          deployer
        );

        expect(result).toBeTuple({
          active: Cl.bool(false),
          "prescription-count": Cl.uint(0),
          "current-block": Cl.uint(simnet.blockHeight)
        });
      }
    });

    it("should handle prescription deactivation cascade", () => {
      // Setup complete workflow
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );

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

      simnet.callPublicFn(
        "refill-management",
        "initialize-refill-rights",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(3)],
        deployer
      );

      // Deactivate prescription
      simnet.callPublicFn(
        "prescription-registry",
        "deactivate-prescription",
        [Cl.uint(1)],
        doctor1
      );

      // Verify prescription is no longer valid
      const { result: isValid } = simnet.callReadOnlyFn(
        "prescription-registry",
        "is-prescription-valid",
        [Cl.uint(1)],
        deployer
      );
      expect(isValid).toBe(Cl.bool(false));

      // Verify refills can't be processed
      const { result: refillFail } = simnet.callPublicFn(
        "refill-management",
        "process-refill",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30)],
        pharmacy1
      );
      expect(refillFail).toBeErr(Cl.uint(301)); // err-prescription-expired

      // Verify dispensation can't be recorded
      const { result: dispenseFail } = simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30), Cl.stringAscii("BATCH001")],
        pharmacy1
      );
      expect(dispenseFail).toBeErr(Cl.uint(301)); // err-prescription-expired
    });
  });

  describe("Data Consistency", () => {
    it("should maintain consistent state across all contracts", () => {
      // Setup complete workflow
      simnet.callPublicFn(
        "prescription-registry",
        "authorize-doctor",
        [Cl.principal(doctor1), Cl.stringAscii("DOC123456")],
        deployer
      );

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

      const validUntil = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        "prescription-registry",
        "issue-prescription",
        [
          Cl.principal(patient1),
          Cl.stringAscii("Amoxicillin"),
          Cl.stringAscii("500mg twice daily"),
          Cl.uint(2),
          Cl.uint(validUntil)
        ],
        doctor1
      );

      simnet.callPublicFn(
        "refill-management",
        "initialize-refill-rights",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(2)],
        deployer
      );

      // Record initial dispensation
      simnet.callPublicFn(
        "dispensation-tracking",
        "record-dispensation",
        [Cl.uint(1), Cl.principal(patient1), Cl.uint(30), Cl.stringAscii("BATCH001")],
        pharmacy1
      );

      // Process both refills
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

      // Verify final state consistency
      const { result: dispenseStats } = simnet.callReadOnlyFn(
        "dispensation-tracking",
        "get-prescription-dispensation-stats",
        [Cl.uint(1)],
        deployer
      );

      expect(dispenseStats).toBeTuple({
        count: Cl.uint(3), // Initial + 2 refills
        "total-quantity": Cl.uint(90),
        "last-dispensation": Cl.uint(simnet.blockHeight)
      });

      const { result: refillRights } = simnet.callReadOnlyFn(
        "refill-management",
        "get-refill-rights",
        [Cl.uint(1)],
        deployer
      );

      expect(refillRights).toBeSome();
      // Should have 0 remaining refills and be inactive

      const { result: canRefill } = simnet.callPublicFn(
        "refill-management",
        "can-refill-prescription",
        [Cl.uint(1)],
        deployer
      );

      expect(canRefill).toBeOk(Cl.bool(false));
    });
  });
});
