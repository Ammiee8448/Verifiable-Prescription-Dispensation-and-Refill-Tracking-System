;; Title: Prescription Registry Contract
;; Description: Core contract for managing doctor authorization and prescription issuance
;; Version: 1.0.0
;; Author: Stacks Developer
;; License: MIT

;; This contract manages the core prescription registry, including doctor authorization
;; and prescription issuance with comprehensive validation and lifecycle management.

;; ===== CONSTANTS =====

;; Contract owner (system administrator)
(define-constant contract-owner tx-sender)

;; Error codes - Authorization (100-199)
(define-constant err-unauthorized (err u100))
(define-constant err-doctor-not-authorized (err u101))
(define-constant err-doctor-already-authorized (err u102))
(define-constant err-not-prescription-patient (err u103))

;; Error codes - Validation (200-299)
(define-constant err-invalid-drug-name (err u200))
(define-constant err-invalid-dosage (err u201))
(define-constant err-invalid-refills (err u202))
(define-constant err-invalid-validity-period (err u203))
(define-constant err-invalid-license-number (err u204))

;; Error codes - Business Logic (300-399)
(define-constant err-prescription-not-found (err u300))
(define-constant err-prescription-expired (err u301))
(define-constant err-prescription-inactive (err u302))
(define-constant err-prescription-already-exists (err u303))

;; Constants for validation
(define-constant min-drug-name-length u2)
(define-constant max-drug-name-length u100)
(define-constant min-dosage-length u3)
(define-constant max-dosage-length u200)
(define-constant max-refills u12)
(define-constant min-validity-period u1)
(define-constant max-validity-period u365)
(define-constant min-license-length u5)
(define-constant max-license-length u50)

;; ===== DATA STRUCTURES =====

;; Counter for generating unique prescription IDs
(define-data-var prescription-counter uint u0)

;; Emergency stop mechanism
(define-data-var contract-active bool true)

;; Map to store authorized doctors
(define-map authorized-doctors
  {doctor: principal}
  {
    license-number: (string-ascii 50),
    authorized-at: uint,
    authorized-by: principal,
    active: bool
  }
)

;; Map to store prescriptions
(define-map prescriptions
  {prescription-id: uint}
  {
    patient: principal,
    doctor: principal,
    drug: (string-ascii 100),
    dosage: (string-ascii 200),
    refills: uint,
    issued-at: uint,
    valid-until: uint,
    active: bool
  }
)

;; Map to track prescriptions by patient
(define-map patient-prescriptions
  {patient: principal}
  {
    prescription-count: uint,
    last-prescription-id: uint
  }
)

;; ===== PRIVATE FUNCTIONS =====

;; Check if contract is active (emergency stop mechanism)
(define-private (require-active-contract)
  (ok (asserts! (var-get contract-active) (err u400)))
)

;; Validate drug name
(define-private (is-valid-drug-name (drug (string-ascii 100)))
  (let ((drug-length (len drug)))
    (and 
      (>= drug-length min-drug-name-length)
      (<= drug-length max-drug-name-length)
    )
  )
)

;; Validate dosage
(define-private (is-valid-dosage (dosage (string-ascii 200)))
  (let ((dosage-length (len dosage)))
    (and 
      (>= dosage-length min-dosage-length)
      (<= dosage-length max-dosage-length)
    )
  )
)

;; Validate refills
(define-private (is-valid-refills (refills uint))
  (<= refills max-refills)
)

;; Validate validity period
(define-private (is-valid-validity-period (valid-until uint))
  (let ((current-block stacks-block-height)
        (validity-period (- valid-until current-block)))
    (and 
      (> valid-until current-block)
      (>= validity-period min-validity-period)
      (<= validity-period max-validity-period)
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

;; ===== READ-ONLY FUNCTIONS =====

;; Check if doctor is authorized
(define-read-only (is-doctor-authorized (doctor principal))
  (match (map-get? authorized-doctors {doctor: doctor})
    doctor-data (get active doctor-data)
    false
  )
)

;; Get doctor details
(define-read-only (get-doctor-details (doctor principal))
  (map-get? authorized-doctors {doctor: doctor})
)

;; Get prescription details
(define-read-only (get-prescription (prescription-id uint))
  (map-get? prescriptions {prescription-id: prescription-id})
)

;; Check if prescription is valid (active and not expired)
(define-read-only (is-prescription-valid (prescription-id uint))
  (match (map-get? prescriptions {prescription-id: prescription-id})
    prescription-data 
      (and 
        (get active prescription-data)
        (> (get valid-until prescription-data) stacks-block-height)
      )
    false
  )
)

;; Get patient prescription stats
(define-read-only (get-patient-prescription-stats (patient principal))
  (default-to 
    {prescription-count: u0, last-prescription-id: u0}
    (map-get? patient-prescriptions {patient: patient})
  )
)

;; Get current prescription counter
(define-read-only (get-prescription-counter)
  (var-get prescription-counter)
)

;; Get contract status
(define-read-only (get-contract-status)
  {
    active: (var-get contract-active),
    prescription-count: (var-get prescription-counter),
    current-block: stacks-block-height
  }
)

;; ===== PUBLIC FUNCTIONS =====

;; Authorize a doctor (admin only)
(define-public (authorize-doctor (doctor principal) (license-number (string-ascii 50)))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Only contract owner can authorize doctors
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    
    ;; Validate license number
    (asserts! (is-valid-license-number license-number) err-invalid-license-number)
    
    ;; Check if doctor is not already authorized
    (asserts! (not (is-doctor-authorized doctor)) err-doctor-already-authorized)
    
    ;; Add doctor to authorized list
    (map-set authorized-doctors 
      {doctor: doctor}
      {
        license-number: license-number,
        authorized-at: stacks-block-height,
        authorized-by: contract-caller,
        active: true
      }
    )
    
    ;; Emit event
    (print {
      event: "doctor-authorized",
      doctor: doctor,
      license-number: license-number,
      authorized-by: contract-caller,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

;; Deauthorize a doctor (admin only)
(define-public (deauthorize-doctor (doctor principal))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Only contract owner can deauthorize doctors
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    
    ;; Check if doctor is authorized
    (asserts! (is-doctor-authorized doctor) err-doctor-not-authorized)
    
    ;; Get current doctor data
    (let ((doctor-data (unwrap! (get-doctor-details doctor) err-doctor-not-authorized)))
      ;; Update doctor status to inactive
      (map-set authorized-doctors 
        {doctor: doctor}
        (merge doctor-data {active: false})
      )
      
      ;; Emit event
      (print {
        event: "doctor-deauthorized",
        doctor: doctor,
        deauthorized-by: contract-caller,
        block-height: stacks-block-height
      })
      
      (ok true)
    )
  )
)

;; Issue a prescription (authorized doctors only)
(define-public (issue-prescription 
  (patient principal)
  (drug (string-ascii 100))
  (dosage (string-ascii 200))
  (refills uint)
  (valid-until uint))
  (let ((prescription-id (+ (var-get prescription-counter) u1))
        (patient-stats (get-patient-prescription-stats patient)))
    (begin
      ;; Check contract is active
      (try! (require-active-contract))
      
      ;; Only authorized doctors can issue prescriptions
      (asserts! (is-doctor-authorized contract-caller) err-doctor-not-authorized)
      
      ;; Validate inputs
      (asserts! (is-valid-drug-name drug) err-invalid-drug-name)
      (asserts! (is-valid-dosage dosage) err-invalid-dosage)
      (asserts! (is-valid-refills refills) err-invalid-refills)
      (asserts! (is-valid-validity-period valid-until) err-invalid-validity-period)
      
      ;; Create prescription
      (map-set prescriptions 
        {prescription-id: prescription-id}
        {
          patient: patient,
          doctor: contract-caller,
          drug: drug,
          dosage: dosage,
          refills: refills,
          issued-at: stacks-block-height,
          valid-until: valid-until,
          active: true
        }
      )
      
      ;; Update patient stats
      (map-set patient-prescriptions 
        {patient: patient}
        {
          prescription-count: (+ (get prescription-count patient-stats) u1),
          last-prescription-id: prescription-id
        }
      )
      
      ;; Update counter
      (var-set prescription-counter prescription-id)
      
      ;; Emit event
      (print {
        event: "prescription-issued",
        prescription-id: prescription-id,
        patient: patient,
        doctor: contract-caller,
        drug: drug,
        dosage: dosage,
        refills: refills,
        valid-until: valid-until,
        block-height: stacks-block-height
      })
      
      (ok prescription-id)
    )
  )
)

;; Public function to check if prescription is valid (for cross-contract calls)
(define-public (check-prescription-valid (prescription-id uint))
  (ok (is-prescription-valid prescription-id))
)

;; Deactivate a prescription (doctor or admin only)
(define-public (deactivate-prescription (prescription-id uint))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Get prescription details
    (let ((prescription-data (unwrap! (get-prescription prescription-id) err-prescription-not-found)))
      ;; Check authorization (doctor who issued it or admin)
      (asserts! 
        (or 
          (is-eq contract-caller (get doctor prescription-data))
          (is-eq contract-caller contract-owner)
        ) 
        err-unauthorized
      )
      
      ;; Check if prescription is active
      (asserts! (get active prescription-data) err-prescription-inactive)
      
      ;; Deactivate prescription
      (map-set prescriptions 
        {prescription-id: prescription-id}
        (merge prescription-data {active: false})
      )
      
      ;; Emit event
      (print {
        event: "prescription-deactivated",
        prescription-id: prescription-id,
        deactivated-by: contract-caller,
        block-height: stacks-block-height
      })
      
      (ok true)
    )
  )
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
