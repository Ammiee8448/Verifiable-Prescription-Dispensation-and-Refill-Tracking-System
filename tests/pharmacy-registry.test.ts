import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const pharmacy1 = accounts.get("wallet_1")!;
const pharmacy2 = accounts.get("wallet_2")!;
const user1 = accounts.get("wallet_3")!;

describe("Pharmacy Registry Contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("Pharmacy Registration", () => {
    it("should allow admin to register a pharmacy", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "register-pharmacy",
        [
          Cl.stringAscii("City Pharmacy"),
          Cl.principal(pharmacy1),
          Cl.stringAscii("PHARM123456"),
          Cl.stringAscii("Located downtown, 24/7 service")
        ],
        deployer
      );

      expect(result).toBeOk(Cl.uint(1)); // First pharmacy ID

      // Verify pharmacy is registered
      const { result: pharmacyInfo } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-pharmacy-info",
        [Cl.uint(1)],
        deployer
      );

      expect(pharmacyInfo).toBeSome();
    });

    it("should not allow non-admin to register a pharmacy", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "register-pharmacy",
        [
          Cl.stringAscii("City Pharmacy"),
          Cl.principal(pharmacy1),
          Cl.stringAscii("PHARM123456"),
          Cl.stringAscii("Located downtown")
        ],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow registering the same pharmacy address twice", () => {
      // First registration
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

      // Second registration with same address should fail
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "register-pharmacy",
        [
          Cl.stringAscii("Another Pharmacy"),
          Cl.principal(pharmacy1), // Same address
          Cl.stringAscii("PHARM789012"),
          Cl.stringAscii("Different location")
        ],
        deployer
      );

      expect(result).toBeErr(Cl.uint(102)); // err-pharmacy-already-registered
    });

    it("should validate pharmacy registration parameters", () => {
      // Test invalid name (too short)
      const { result: shortName } = simnet.callPublicFn(
        "pharmacy-registry",
        "register-pharmacy",
        [
          Cl.stringAscii("CP"), // Too short
          Cl.principal(pharmacy1),
          Cl.stringAscii("PHARM123456"),
          Cl.stringAscii("Located downtown")
        ],
        deployer
      );

      expect(shortName).toBeErr(Cl.uint(200)); // err-invalid-pharmacy-name

      // Test invalid license (too short)
      const { result: shortLicense } = simnet.callPublicFn(
        "pharmacy-registry",
        "register-pharmacy",
        [
          Cl.stringAscii("City Pharmacy"),
          Cl.principal(pharmacy1),
          Cl.stringAscii("PH"), // Too short
          Cl.stringAscii("Located downtown")
        ],
        deployer
      );

      expect(shortLicense).toBeErr(Cl.uint(201)); // err-invalid-license-number
    });
  });

  describe("Pharmacy Verification", () => {
    beforeEach(() => {
      // Register a pharmacy for verification tests
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
    });

    it("should allow admin to verify a pharmacy", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "verify-pharmacy",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify pharmacy is verified
      const { result: isVerified } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "is-pharmacy-verified-by-id",
        [Cl.uint(1)],
        deployer
      );

      expect(isVerified).toBe(Cl.bool(true));

      // Also check by address
      const { result: isVerifiedByAddress } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "is-pharmacy-verified",
        [Cl.principal(pharmacy1)],
        deployer
      );

      expect(isVerifiedByAddress).toBe(Cl.bool(true));
    });

    it("should not allow non-admin to verify a pharmacy", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "verify-pharmacy",
        [Cl.uint(1)],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow verifying the same pharmacy twice", () => {
      // First verification
      simnet.callPublicFn(
        "pharmacy-registry",
        "verify-pharmacy",
        [Cl.uint(1)],
        deployer
      );

      // Second verification should fail
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "verify-pharmacy",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(300)); // err-pharmacy-already-verified
    });

    it("should not allow verifying non-existent pharmacy", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "verify-pharmacy",
        [Cl.uint(999)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(101)); // err-pharmacy-not-found
    });
  });

  describe("Pharmacy Revocation", () => {
    beforeEach(() => {
      // Register and verify a pharmacy
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
    });

    it("should allow admin to revoke pharmacy verification", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "revoke-pharmacy",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify pharmacy is no longer verified
      const { result: isVerified } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "is-pharmacy-verified-by-id",
        [Cl.uint(1)],
        deployer
      );

      expect(isVerified).toBe(Cl.bool(false));
    });

    it("should not allow non-admin to revoke pharmacy", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "revoke-pharmacy",
        [Cl.uint(1)],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should not allow revoking unverified pharmacy", () => {
      // Register another pharmacy but don't verify
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
        "pharmacy-registry",
        "revoke-pharmacy",
        [Cl.uint(2)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(103)); // err-pharmacy-not-verified
    });
  });

  describe("Metadata Management", () => {
    beforeEach(() => {
      // Register a pharmacy
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
    });

    it("should allow admin to update pharmacy metadata", () => {
      const newMetadata = "Updated location: uptown, extended hours";
      
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "update-pharmacy-metadata",
        [Cl.uint(1), Cl.stringAscii(newMetadata)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify metadata was updated
      const { result: pharmacyInfo } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-pharmacy-info",
        [Cl.uint(1)],
        deployer
      );

      expect(pharmacyInfo).toBeSome();
    });

    it("should not allow non-admin to update metadata", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "update-pharmacy-metadata",
        [Cl.uint(1), Cl.stringAscii("New metadata")],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should validate metadata length", () => {
      // Create metadata that's too long (over 200 characters)
      const longMetadata = "a".repeat(201);
      
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "update-pharmacy-metadata",
        [Cl.uint(1), Cl.stringAscii(longMetadata)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(202)); // err-invalid-metadata
    });
  });

  describe("Read-Only Functions", () => {
    beforeEach(() => {
      // Register and verify a pharmacy
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
    });

    it("should return pharmacy info by ID", () => {
      const { result } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-pharmacy-info",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return pharmacy info by address", () => {
      const { result } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-pharmacy-by-address",
        [Cl.principal(pharmacy1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return pharmacy ID by address", () => {
      const { result } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-pharmacy-id",
        [Cl.principal(pharmacy1)],
        deployer
      );

      expect(result).toBeSome();
    });

    it("should return correct pharmacy counter", () => {
      const { result } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-pharmacy-counter",
        [],
        deployer
      );

      expect(result).toBe(Cl.uint(1));
    });

    it("should return contract status", () => {
      const { result } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-contract-status",
        [],
        deployer
      );

      expect(result).toBeTuple({
        active: Cl.bool(true),
        "pharmacy-count": Cl.uint(1),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should return none for non-existent pharmacy", () => {
      const { result } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-pharmacy-info",
        [Cl.uint(999)],
        deployer
      );

      expect(result).toBeNone();
    });

    it("should return false for unregistered pharmacy address", () => {
      const { result } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "is-pharmacy-verified",
        [Cl.principal(pharmacy2)],
        deployer
      );

      expect(result).toBe(Cl.bool(false));
    });
  });

  describe("Emergency Controls", () => {
    it("should allow admin to emergency stop contract", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "emergency-stop",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is stopped
      const { result: status } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(false),
        "pharmacy-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });

    it("should not allow non-admin to emergency stop", () => {
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "emergency-stop",
        [],
        pharmacy1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("should allow admin to resume contract", () => {
      // First stop
      simnet.callPublicFn(
        "pharmacy-registry",
        "emergency-stop",
        [],
        deployer
      );

      // Then resume
      const { result } = simnet.callPublicFn(
        "pharmacy-registry",
        "resume-contract",
        [],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify contract is active
      const { result: status } = simnet.callReadOnlyFn(
        "pharmacy-registry",
        "get-contract-status",
        [],
        deployer
      );

      expect(status).toBeTuple({
        active: Cl.bool(true),
        "pharmacy-count": Cl.uint(0),
        "current-block": Cl.uint(simnet.blockHeight)
      });
    });
  });
});
