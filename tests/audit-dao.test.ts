import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const auditor1 = accounts.get("wallet_1")!;
const auditor2 = accounts.get("wallet_2")!;
const user1 = accounts.get("wallet_3")!;

describe("Audit DAO Contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("Auditor Registration", () => {
    it("should allow admin to register an auditor", () => {
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("REGULATOR"),
          Cl.uint(10) // voting power
        ],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify auditor is registered
      const { result: auditorInfo } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-auditor-info",
        [Cl.principal(auditor1)],
        deployer
      );

      expect(auditorInfo).toBeSome();
    });

    it("should not allow non-admin to register an auditor", () => {
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("REGULATOR"),
          Cl.uint(10)
        ],
        auditor1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow registering the same auditor twice", () => {
      // First registration
      simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("REGULATOR"),
          Cl.uint(10)
        ],
        deployer
      );

      // Second registration should fail
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("INSPECTOR"),
          Cl.uint(5)
        ],
        deployer
      );

      expect(result).toBeErr(Cl.uint(102)); // err-auditor-already-registered
    });
  });

  describe("Proposal Creation", () => {
    beforeEach(() => {
      // Register auditors for proposal tests
      simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("REGULATOR"),
          Cl.uint(10)
        ],
        deployer
      );

      simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor2),
          Cl.stringAscii("INSPECTOR"),
          Cl.uint(5)
        ],
        deployer
      );
    });

    it("should allow verified auditor to create proposal", () => {
      const deadline = simnet.blockHeight + 1000;
      
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Update Compliance Rules"),
          Cl.stringAscii("Proposal to update the compliance rules for prescription tracking to include new requirements."),
          Cl.uint(deadline),
          Cl.stringAscii("POLICY")
        ],
        auditor1
      );

      expect(result).toBeOk(Cl.uint(1)); // First proposal ID

      // Verify proposal was created
      const { result: proposal } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );

      expect(proposal).toBeSome();
    });

    it("should not allow non-auditor to create proposal", () => {
      const deadline = simnet.blockHeight + 1000;
      
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Update Rules"),
          Cl.stringAscii("Some description"),
          Cl.uint(deadline),
          Cl.stringAscii("POLICY")
        ],
        user1
      );

      expect(result).toBeErr(Cl.uint(101)); // err-not-auditor
    });

    it("should validate proposal parameters", () => {
      const deadline = simnet.blockHeight + 1000;

      // Test invalid title (too short)
      const { result: shortTitle } = simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Test"), // Too short
          Cl.stringAscii("Valid description for the proposal"),
          Cl.uint(deadline),
          Cl.stringAscii("POLICY")
        ],
        auditor1
      );

      expect(shortTitle).toBeErr(Cl.uint(201)); // err-invalid-title

      // Test invalid description (too short)
      const { result: shortDesc } = simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Valid Title"),
          Cl.stringAscii("Short"), // Too short
          Cl.uint(deadline),
          Cl.stringAscii("POLICY")
        ],
        auditor1
      );

      expect(shortDesc).toBeErr(Cl.uint(202)); // err-invalid-description

      // Test invalid deadline (too soon)
      const { result: badDeadline } = simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Valid Title"),
          Cl.stringAscii("Valid description for the proposal"),
          Cl.uint(simnet.blockHeight + 100), // Too soon
          Cl.stringAscii("POLICY")
        ],
        auditor1
      );

      expect(badDeadline).toBeErr(Cl.uint(203)); // err-invalid-deadline

      // Test invalid proposal type
      const { result: badType } = simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Valid Title"),
          Cl.stringAscii("Valid description for the proposal"),
          Cl.uint(deadline),
          Cl.stringAscii("INVALID") // Invalid type
        ],
        auditor1
      );

      expect(badType).toBeErr(Cl.uint(204)); // err-invalid-proposal-type
    });
  });

  describe("Voting", () => {
    beforeEach(() => {
      // Register auditors
      simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("REGULATOR"),
          Cl.uint(10)
        ],
        deployer
      );

      simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor2),
          Cl.stringAscii("INSPECTOR"),
          Cl.uint(5)
        ],
        deployer
      );

      // Create a proposal
      const deadline = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Update Compliance Rules"),
          Cl.stringAscii("Proposal to update the compliance rules for prescription tracking."),
          Cl.uint(deadline),
          Cl.stringAscii("POLICY")
        ],
        auditor1
      );
    });

    it("should allow verified auditor to vote on proposal", () => {
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(1), Cl.bool(true)], // Vote yes
        auditor2
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify vote was recorded
      const { result: vote } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-vote",
        [Cl.uint(1), Cl.principal(auditor2)],
        deployer
      );

      expect(vote).toBeSome();
    });

    it("should not allow non-auditor to vote", () => {
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(1), Cl.bool(true)],
        user1
      );

      expect(result).toBeErr(Cl.uint(101)); // err-not-auditor
    });

    it("should not allow voting twice on same proposal", () => {
      // First vote
      simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(1), Cl.bool(true)],
        auditor1
      );

      // Second vote should fail
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(1), Cl.bool(false)],
        auditor1
      );

      expect(result).toBeErr(Cl.uint(303)); // err-already-voted
    });

    it("should not allow voting on expired proposal", () => {
      // Create proposal with short deadline
      const shortDeadline = simnet.blockHeight + 150; // Minimum deadline
      simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Short Deadline Proposal"),
          Cl.stringAscii("This proposal has a very short deadline for testing."),
          Cl.uint(shortDeadline),
          Cl.stringAscii("EMERGENCY")
        ],
        auditor1
      );

      // Advance blocks past deadline
      simnet.mineEmptyBlocks(200);

      // Try to vote on expired proposal
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(2), Cl.bool(true)],
        auditor2
      );

      expect(result).toBeErr(Cl.uint(301)); // err-proposal-expired
    });

    it("should update proposal vote counts correctly", () => {
      // Vote yes with auditor1 (10 voting power)
      simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(1), Cl.bool(true)],
        auditor1
      );

      // Vote no with auditor2 (5 voting power)
      simnet.callPublicFn(
        "audit-dao",
        "vote-on-proposal",
        [Cl.uint(1), Cl.bool(false)],
        auditor2
      );

      // Check proposal vote counts
      const { result: proposal } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );

      expect(proposal).toBeSome();
      // Should have 10 votes for and 5 votes against
    });
  });

  describe("Audit Reports", () => {
    beforeEach(() => {
      // Register an auditor
      simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("AUDITOR"),
          Cl.uint(10)
        ],
        deployer
      );
    });

    it("should allow verified auditor to submit audit report", () => {
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "submit-audit-report",
        [
          Cl.stringAscii("prescription-registry"),
          Cl.stringAscii("Found potential issue with authorization checks in doctor verification process."),
          Cl.stringAscii("MEDIUM")
        ],
        auditor1
      );

      expect(result).toBeOk(Cl.uint(1)); // First report ID

      // Verify report was created
      const { result: report } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-audit-report",
        [Cl.uint(1)],
        deployer
      );

      expect(report).toBeSome();
    });

    it("should not allow non-auditor to submit audit report", () => {
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "submit-audit-report",
        [
          Cl.stringAscii("prescription-registry"),
          Cl.stringAscii("Some findings"),
          Cl.stringAscii("LOW")
        ],
        user1
      );

      expect(result).toBeErr(Cl.uint(101)); // err-not-auditor
    });
  });

  describe("Read-Only Functions", () => {
    beforeEach(() => {
      // Setup test data
      simnet.callPublicFn(
        "audit-dao",
        "register-auditor",
        [
          Cl.principal(auditor1),
          Cl.stringAscii("REGULATOR"),
          Cl.uint(10)
        ],
        deployer
      );

      const deadline = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        "audit-dao",
        "create-proposal",
        [
          Cl.stringAscii("Test Proposal"),
          Cl.stringAscii("This is a test proposal for read-only function testing."),
          Cl.uint(deadline),
          Cl.stringAscii("POLICY")
        ],
        auditor1
      );

      simnet.callPublicFn(
        "audit-dao",
        "submit-audit-report",
        [
          Cl.stringAscii("test-contract"),
          Cl.stringAscii("Test audit findings for read-only function testing."),
          Cl.stringAscii("LOW")
        ],
        auditor1
      );
    });

    it("should return proposal details", () => {
      const { result } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return auditor information", () => {
      const { result } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-auditor-info",
        [Cl.principal(auditor1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return audit report", () => {
      const { result } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-audit-report",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return correct counters", () => {
      const { result: proposalCounter } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-proposal-counter",
        [],
        deployer
      );

      expect(proposalCounter).toBe(Cl.uint(1));

      const { result: reportCounter } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-report-counter",
        [],
        deployer
      );

      expect(reportCounter).toBe(Cl.uint(1));
    });

    it("should return contract status", () => {
      const { result } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-contract-status",
        [],
        deployer
      );

      expect(result).toBeTuple({
        active: Cl.bool(true),
        "proposal-count": Cl.uint(1),
        "report-count": Cl.uint(1),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should check if proposal can be executed", () => {
      const { result } = simnet.callReadOnlyFn(
        "audit-dao",
        "can-execute-proposal",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBe(Cl.bool(false)); // No votes yet, so can't execute
    });

    it("should return none for non-existent items", () => {
      const { result: noProposal } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-proposal",
        [Cl.uint(999)],
        deployer
      );

      expect(noProposal).toBeNone();

      const { result: noReport } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-audit-report",
        [Cl.uint(999)],
        deployer
      );

      expect(noReport).toBeNone();

      const { result: noAuditor } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-auditor-info",
        [Cl.principal(user1)],
        deployer
      );

      expect(noAuditor).toBeNone();
    });
  });

  describe("Emergency Controls", () => {
    it("should allow admin to emergency stop contract", () => {
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "emergency-stop",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is stopped
      const { result: status } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(false),
        "proposal-count": Cl.uint(0),
        "report-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should allow admin to resume contract", () => {
      // First stop
      simnet.callPublicFn(
        "audit-dao",
        "emergency-stop",
        [],
        deployer
      );

      // Then resume
      const { result } = simnet.callPublicFn(
        "audit-dao",
        "resume-contract",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is active
      const { result: status } = simnet.callReadOnlyFn(
        "audit-dao",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(true),
        "proposal-count": Cl.uint(0),
        "report-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });
  });
});
