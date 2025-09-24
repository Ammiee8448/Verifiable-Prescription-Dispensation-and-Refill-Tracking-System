;; Title: Pharmacy Registry Contract
;; Description: Contract for managing pharmacy registration and verification
;; Version: 1.0.0
;; Author: Stacks Developer
;; License: MIT

;; This contract manages the pharmacy registry, including registration, verification,
;; and address-based lookups for authorized pharmacies.

;; ===== CONSTANTS =====

;; Contract owner (system administrator)
(define-constant contract-owner tx-sender)

;; Error codes - Authorization (100-199)
(define-constant err-unauthorized (err u100))
(define-constant err-pharmacy-not-found (err u101))
(define-constant err-pharmacy-already-registered (err u102))
(define-constant err-pharmacy-not-verified (err u103))

;; Error codes - Validation (200-299)
(define-constant err-invalid-name (err u200))
(define-constant err-invalid-license-number (err u201))
(define-constant err-invalid-metadata (err u202))
(define-constant err-license-already-exists (err u203))

;; Error codes - Business Logic (300-399)
(define-constant err-pharmacy-already-verified (err u300))
(define-constant err-pharmacy-inactive (err u301))

;; Constants for validation
(define-constant min-name-length u2)
(define-constant max-name-length u100)
(define-constant min-license-length u5)
(define-constant max-license-length u50)
(define-constant min-metadata-length u0)
(define-constant max-metadata-length u500)

;; ===== DATA STRUCTURES =====

;; Counter for generating unique pharmacy IDs
(define-data-var pharmacy-counter uint u0)

;; Emergency stop mechanism
(define-data-var contract-active bool true)

;; Map to store pharmacy details
(define-map pharmacies
  {pharmacy-id: uint}
  {
    name: (string-ascii 100),
    address: principal,
    license-number: (string-ascii 50),
    metadata: (string-ascii 500),
    verified: bool,
    registered-at: uint,
    registered-by: principal,
    active: bool
  }
)

;; Map for address-based pharmacy lookup
(define-map pharmacy-addresses
  {address: principal}
  {
    pharmacy-id: uint,
    verified: bool
  }
)

;; Map for license number uniqueness
(define-map pharmacy-licenses
  {license-number: (string-ascii 50)}
  {
    pharmacy-id: uint,
    address: principal
  }
)

;; ===== PRIVATE FUNCTIONS =====

;; Check if contract is active (emergency stop mechanism)
(define-private (require-active-contract)
  (ok (asserts! (var-get contract-active) (err u400)))
)

;; Validate pharmacy name
(define-private (is-valid-name (name (string-ascii 100)))
  (let ((name-length (len name)))
    (and 
      (>= name-length min-name-length)
      (<= name-length max-name-length)
    )
  )
)

;; Validate license number
(define-private (is-valid-license-number (license (string-ascii 50)))
  (let ((license-length (len license)))
    (and 
      (>= license-length min-license-length)
      (<= license-length max-license-length)
    )
  )
)

;; Validate metadata
(define-private (is-valid-metadata (metadata (string-ascii 500)))
  (let ((metadata-length (len metadata)))
    (and 
      (>= metadata-length min-metadata-length)
      (<= metadata-length max-metadata-length)
    )
  )
)

;; Check if license number already exists
(define-private (license-exists (license-number (string-ascii 50)))
  (is-some (map-get? pharmacy-licenses {license-number: license-number}))
)

;; ===== READ-ONLY FUNCTIONS =====

;; Get pharmacy details by ID
(define-read-only (get-pharmacy (pharmacy-id uint))
  (map-get? pharmacies {pharmacy-id: pharmacy-id})
)

;; Get pharmacy ID by address
(define-read-only (get-pharmacy-by-address (address principal))
  (map-get? pharmacy-addresses {address: address})
)

;; Check if pharmacy is verified by address
(define-read-only (is-pharmacy-verified (address principal))
  (match (map-get? pharmacy-addresses {address: address})
    pharmacy-data (get verified pharmacy-data)
    false
  )
)

;; Get pharmacy by license number
(define-read-only (get-pharmacy-by-license (license-number (string-ascii 50)))
  (map-get? pharmacy-licenses {license-number: license-number})
)

;; Get current pharmacy counter
(define-read-only (get-pharmacy-counter)
  (var-get pharmacy-counter)
)

;; Get contract status
(define-read-only (get-contract-status)
  {
    active: (var-get contract-active),
    pharmacy-count: (var-get pharmacy-counter),
    current-block: stacks-block-height
  }
)

;; ===== PUBLIC FUNCTIONS =====

;; Register a new pharmacy (admin only)
(define-public (register-pharmacy 
  (name (string-ascii 100))
  (address principal)
  (license-number (string-ascii 50))
  (metadata (string-ascii 500)))
  (let ((pharmacy-id (+ (var-get pharmacy-counter) u1)))
    (begin
      ;; Check contract is active
      (try! (require-active-contract))
      
      ;; Only contract owner can register pharmacies
      (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
      
      ;; Validate inputs
      (asserts! (is-valid-name name) err-invalid-name)
      (asserts! (is-valid-license-number license-number) err-invalid-license-number)
      (asserts! (is-valid-metadata metadata) err-invalid-metadata)
      
      ;; Check if address is not already registered
      (asserts! (is-none (get-pharmacy-by-address address)) err-pharmacy-already-registered)
      
      ;; Check if license number is unique
      (asserts! (not (license-exists license-number)) err-license-already-exists)
      
      ;; Register pharmacy
      (map-set pharmacies 
        {pharmacy-id: pharmacy-id}
        {
          name: name,
          address: address,
          license-number: license-number,
          metadata: metadata,
          verified: false,
          registered-at: stacks-block-height,
          registered-by: contract-caller,
          active: true
        }
      )
      
      ;; Set address mapping
      (map-set pharmacy-addresses 
        {address: address}
        {
          pharmacy-id: pharmacy-id,
          verified: false
        }
      )
      
      ;; Set license mapping
      (map-set pharmacy-licenses 
        {license-number: license-number}
        {
          pharmacy-id: pharmacy-id,
          address: address
        }
      )
      
      ;; Update counter
      (var-set pharmacy-counter pharmacy-id)
      
      ;; Emit event
      (print {
        event: "pharmacy-registered",
        pharmacy-id: pharmacy-id,
        name: name,
        address: address,
        license-number: license-number,
        registered-by: contract-caller,
        block-height: stacks-block-height
      })
      
      (ok pharmacy-id)
    )
  )
)

;; Verify a pharmacy (admin only)
(define-public (verify-pharmacy (pharmacy-id uint))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Only contract owner can verify pharmacies
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    
    ;; Get pharmacy details
    (let ((pharmacy-data (unwrap! (get-pharmacy pharmacy-id) err-pharmacy-not-found)))
      ;; Check if pharmacy is active
      (asserts! (get active pharmacy-data) err-pharmacy-inactive)
      
      ;; Check if not already verified
      (asserts! (not (get verified pharmacy-data)) err-pharmacy-already-verified)
      
      ;; Update pharmacy verification status
      (map-set pharmacies 
        {pharmacy-id: pharmacy-id}
        (merge pharmacy-data {verified: true})
      )
      
      ;; Update address mapping
      (map-set pharmacy-addresses 
        {address: (get address pharmacy-data)}
        {
          pharmacy-id: pharmacy-id,
          verified: true
        }
      )
      
      ;; Emit event
      (print {
        event: "pharmacy-verified",
        pharmacy-id: pharmacy-id,
        address: (get address pharmacy-data),
        verified-by: contract-caller,
        block-height: stacks-block-height
      })
      
      (ok true)
    )
  )
)

;; Revoke pharmacy verification (admin only)
(define-public (revoke-pharmacy (pharmacy-id uint))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Only contract owner can revoke pharmacies
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    
    ;; Get pharmacy details
    (let ((pharmacy-data (unwrap! (get-pharmacy pharmacy-id) err-pharmacy-not-found)))
      ;; Update pharmacy verification status
      (map-set pharmacies 
        {pharmacy-id: pharmacy-id}
        (merge pharmacy-data {verified: false, active: false})
      )
      
      ;; Update address mapping
      (map-set pharmacy-addresses 
        {address: (get address pharmacy-data)}
        {
          pharmacy-id: pharmacy-id,
          verified: false
        }
      )
      
      ;; Emit event
      (print {
        event: "pharmacy-revoked",
        pharmacy-id: pharmacy-id,
        address: (get address pharmacy-data),
        revoked-by: contract-caller,
        block-height: stacks-block-height
      })
      
      (ok true)
    )
  )
)

;; Public function to check if pharmacy is verified (for cross-contract calls)
(define-public (check-pharmacy-verified (address principal))
  (ok (is-pharmacy-verified address))
)

;; Emergency stop function (admin only)
(define-public (emergency-stop)
  (begin
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    (var-set contract-active false)
    (print {
      event: "emergency-stop",
      stopped-by: contract-caller,
      block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Resume contract operations (admin only)
(define-public (resume-contract)
  (begin
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    (var-set contract-active true)
    (print {
      event: "contract-resumed",
      resumed-by: contract-caller,
      block-height: stacks-block-height
    })
    (ok true)
  )
)
