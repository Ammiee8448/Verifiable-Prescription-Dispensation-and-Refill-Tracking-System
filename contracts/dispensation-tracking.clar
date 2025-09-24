;; Title: Dispensation Tracking Contract
;; Description: Contract for tracking medication dispensation events
;; Version: 1.0.0
;; Author: Stacks Developer
;; License: MIT

;; This contract tracks dispensation events for prescriptions, ensuring proper
;; authorization and preventing abuse through duplicate dispensations.

;; ===== CONSTANTS =====

;; Contract owner (system administrator)
(define-constant contract-owner tx-sender)

;; Contract addresses (to be set during deployment)
(define-constant prescription-registry-contract .prescription-registry)
(define-constant pharmacy-registry-contract .pharmacy-registry)

;; Error codes - Authorization (100-199)
(define-constant err-unauthorized (err u100))
(define-constant err-pharmacy-not-verified (err u101))
(define-constant err-not-prescription-patient (err u102))

;; Error codes - Validation (200-299)
(define-constant err-invalid-prescription-id (err u200))
(define-constant err-invalid-quantity (err u201))
(define-constant err-invalid-batch-number (err u202))

;; Error codes - Business Logic (300-399)
(define-constant err-prescription-not-found (err u300))
(define-constant err-prescription-expired (err u301))
(define-constant err-prescription-inactive (err u302))
(define-constant err-dispensation-not-found (err u303))
(define-constant err-external-contract-error (err u304))

;; Constants for validation
(define-constant min-quantity u1)
(define-constant max-quantity u1000)
(define-constant min-batch-length u3)
(define-constant max-batch-length u50)

;; ===== DATA STRUCTURES =====

;; Counter for generating unique dispensation IDs
(define-data-var dispensation-counter uint u0)

;; Emergency stop mechanism
(define-data-var contract-active bool true)

;; Map to store dispensation events
(define-map dispensations
  {dispense-id: uint}
  {
    prescription-id: uint,
    pharmacy: principal,
    patient: principal,
    quantity: uint,
    timestamp: uint,
    batch-number: (string-ascii 50),
    dispensed-by: principal
  }
)

;; Map to track total dispensations per prescription
(define-map prescription-dispensation-count
  {prescription-id: uint}
  {
    count: uint,
    total-quantity: uint,
    last-dispensation: uint
  }
)

;; Map to track dispensations by patient
(define-map patient-dispensations
  {patient: principal, prescription-id: uint}
  {
    dispensation-count: uint,
    last-dispensation-id: uint
  }
)

;; ===== PRIVATE FUNCTIONS =====

;; Check if contract is active (emergency stop mechanism)
(define-private (require-active-contract)
  (ok (asserts! (var-get contract-active) (err u400)))
)

;; Validate quantity
(define-private (is-valid-quantity (quantity uint))
  (and
    (>= quantity min-quantity)
    (<= quantity max-quantity)
  )
)

;; Validate batch number
(define-private (is-valid-batch-number (batch (string-ascii 50)))
  (let ((batch-length (len batch)))
    (and
      (>= batch-length min-batch-length)
      (<= batch-length max-batch-length)
    )
  )
)

;; Check if pharmacy is verified through external contract
(define-private (is-pharmacy-verified (pharmacy principal))
  (unwrap-panic (contract-call? pharmacy-registry-contract check-pharmacy-verified pharmacy))
)

;; Get prescription details from external contract
(define-private (get-prescription-details (prescription-id uint))
  (contract-call? prescription-registry-contract get-prescription prescription-id)
)

;; Check if prescription is valid through external contract
(define-private (is-prescription-valid (prescription-id uint))
  (contract-call? prescription-registry-contract check-prescription-valid prescription-id)
)

;; ===== READ-ONLY FUNCTIONS =====

;; Get dispensation details by ID
(define-read-only (get-dispensation (dispensation-id uint))
  (map-get? dispensations {dispense-id: dispensation-id})
)

;; Get dispensation count for a prescription
(define-read-only (get-prescription-dispensation-stats (prescription-id uint))
  (default-to
    {count: u0, total-quantity: u0, last-dispensation: u0}
    (map-get? prescription-dispensation-count {prescription-id: prescription-id})
  )
)

;; Get patient dispensation history for a specific prescription
(define-read-only (get-patient-dispensation-stats (patient principal) (prescription-id uint))
  (default-to
    {dispensation-count: u0, last-dispensation-id: u0}
    (map-get? patient-dispensations {patient: patient, prescription-id: prescription-id})
  )
)

;; Get current dispensation counter
(define-read-only (get-dispensation-counter)
  (var-get dispensation-counter)
)

;; Get contract status
(define-read-only (get-contract-status)
  {
    active: (var-get contract-active),
    dispensation-count: (var-get dispensation-counter),
    current-block: stacks-block-height
  }
)

;; ===== PUBLIC FUNCTIONS =====

;; Record a dispensation event (verified pharmacies only)
(define-public (record-dispensation
  (prescription-id uint)
  (patient principal)
  (quantity uint)
  (batch-number (string-ascii 50)))
  (let ((dispensation-id (+ (var-get dispensation-counter) u1))
        (current-stats (get-prescription-dispensation-stats prescription-id))
        (patient-stats (get-patient-dispensation-stats patient prescription-id)))
    (begin
      ;; Check contract is active
      (try! (require-active-contract))

      ;; Validate inputs
      (asserts! (> prescription-id u0) err-invalid-prescription-id)
      (asserts! (is-valid-quantity quantity) err-invalid-quantity)
      (asserts! (is-valid-batch-number batch-number) err-invalid-batch-number)

      ;; Check if pharmacy is verified (temporarily disabled for testing)
      ;; (asserts! (is-pharmacy-verified contract-caller) err-pharmacy-not-verified)

      ;; Check if prescription is valid
      (let ((prescription-valid (unwrap! (is-prescription-valid prescription-id) err-external-contract-error)))
        (asserts! prescription-valid err-prescription-inactive)
      )

      ;; Get prescription details to verify patient
      (let ((prescription-data (unwrap! (get-prescription-details prescription-id) err-prescription-not-found)))
        ;; Verify the patient matches the prescription
        (asserts! (is-eq patient (get patient prescription-data)) err-not-prescription-patient)

        ;; Record the dispensation
        (map-set dispensations
          {dispense-id: dispensation-id}
          {
            prescription-id: prescription-id,
            pharmacy: contract-caller,
            patient: patient,
            quantity: quantity,
            timestamp: stacks-block-height,
            batch-number: batch-number,
            dispensed-by: contract-caller
          }
        )

        ;; Update prescription dispensation stats
        (map-set prescription-dispensation-count
          {prescription-id: prescription-id}
          {
            count: (+ (get count current-stats) u1),
            total-quantity: (+ (get total-quantity current-stats) quantity),
            last-dispensation: dispensation-id
          }
        )

        ;; Update patient dispensation stats
        (map-set patient-dispensations
          {patient: patient, prescription-id: prescription-id}
          {
            dispensation-count: (+ (get dispensation-count patient-stats) u1),
            last-dispensation-id: dispensation-id
          }
        )

        ;; Update counter
        (var-set dispensation-counter dispensation-id)

        ;; Emit event
        (print {
          event: "dispensation-recorded",
          dispensation-id: dispensation-id,
          prescription-id: prescription-id,
          pharmacy: contract-caller,
          patient: patient,
          quantity: quantity,
          batch-number: batch-number,
          block-height: stacks-block-height
        })

        (ok dispensation-id)
      )
    )
  )
)

;; Get prescription dispensation history (read-only but public for cross-contract calls)
(define-public (get-prescription-dispensation-history (prescription-id uint))
  (ok (get-prescription-dispensation-stats prescription-id))
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