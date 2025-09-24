;; Title: Refill Management Contract
;; Description: Contract for managing prescription refills and limits
;; Version: 1.0.0
;; Author: Stacks Developer
;; License: MIT

;; This contract manages prescription refills, enforcing limits and tracking
;; refill usage to prevent abuse and ensure proper medication management.

;; ===== CONSTANTS =====

;; Contract owner (system administrator)
(define-constant contract-owner tx-sender)

;; Contract addresses (to be set during deployment)
(define-constant prescription-registry-contract .prescription-registry)
(define-constant dispensation-tracking-contract .dispensation-tracking)

;; Error codes - Authorization (100-199)
(define-constant err-unauthorized (err u100))
(define-constant err-not-prescription-patient (err u101))

;; Error codes - Validation (200-299)
(define-constant err-invalid-prescription-id (err u200))
(define-constant err-invalid-quantity (err u201))

;; Error codes - Business Logic (300-399)
(define-constant err-prescription-not-found (err u300))
(define-constant err-prescription-expired (err u301))
(define-constant err-prescription-inactive (err u302))
(define-constant err-refill-rights-not-found (err u303))
(define-constant err-no-refills-remaining (err u304))
(define-constant err-refill-rights-already-exist (err u305))
(define-constant err-external-contract-error (err u306))

;; Constants for validation
(define-constant min-quantity u1)
(define-constant max-quantity u1000)

;; ===== DATA STRUCTURES =====

;; Emergency stop mechanism
(define-data-var contract-active bool true)

;; Map to store refill rights for prescriptions
(define-map refill-rights
  {prescription-id: uint, patient: principal}
  {
    refills-allowed: uint,
    refills-used: uint,
    last-refill-date: uint,
    active: bool
  }
)

;; Map to track refill history
(define-map refill-history
  {prescription-id: uint, refill-number: uint}
  {
    patient: principal,
    quantity: uint,
    refill-date: uint,
    dispensation-id: uint
  }
)

;; Map to track patient refill statistics
(define-map patient-refill-stats
  {patient: principal}
  {
    total-refills: uint,
    active-prescriptions: uint,
    last-refill-date: uint
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

;; Get prescription details from external contract
(define-private (get-prescription-details (prescription-id uint))
  (contract-call? prescription-registry-contract get-prescription prescription-id)
)

;; Check if prescription is valid through external contract
(define-private (is-prescription-valid (prescription-id uint))
  (contract-call? prescription-registry-contract is-prescription-valid prescription-id)
)

;; Record dispensation through external contract
(define-private (record-dispensation-event (prescription-id uint) (patient principal) (quantity uint))
  (contract-call? dispensation-tracking-contract record-dispensation 
    prescription-id 
    patient 
    quantity 
    "REFILL-BATCH")
)

;; ===== READ-ONLY FUNCTIONS =====

;; Get refill rights for a prescription
(define-read-only (get-refill-rights (prescription-id uint) (patient principal))
  (map-get? refill-rights {prescription-id: prescription-id, patient: patient})
)

;; Get refill history for a prescription
(define-read-only (get-refill-history (prescription-id uint) (refill-number uint))
  (map-get? refill-history {prescription-id: prescription-id, refill-number: refill-number})
)

;; Get patient refill statistics
(define-read-only (get-patient-refill-stats (patient principal))
  (default-to 
    {total-refills: u0, active-prescriptions: u0, last-refill-date: u0}
    (map-get? patient-refill-stats {patient: patient})
  )
)

;; Check remaining refills for a prescription
(define-read-only (get-remaining-refills (prescription-id uint) (patient principal))
  (match (get-refill-rights prescription-id patient)
    refill-data 
      (if (get active refill-data)
        (- (get refills-allowed refill-data) (get refills-used refill-data))
        u0
      )
    u0
  )
)

;; Get contract status
(define-read-only (get-contract-status)
  {
    active: (var-get contract-active),
    current-block: stacks-block-height
  }
)

;; ===== PUBLIC FUNCTIONS =====

;; Initialize refill rights for a prescription (called by prescription registry)
(define-public (initialize-refill-rights 
  (prescription-id uint)
  (patient principal)
  (refills-allowed uint))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Only prescription registry contract can initialize refill rights
    (asserts! (is-eq contract-caller prescription-registry-contract) err-unauthorized)
    
    ;; Validate inputs
    (asserts! (> prescription-id u0) err-invalid-prescription-id)
    
    ;; Check if refill rights don't already exist
    (asserts! (is-none (get-refill-rights prescription-id patient)) err-refill-rights-already-exist)
    
    ;; Initialize refill rights
    (map-set refill-rights 
      {prescription-id: prescription-id, patient: patient}
      {
        refills-allowed: refills-allowed,
        refills-used: u0,
        last-refill-date: u0,
        active: true
      }
    )
    
    ;; Update patient stats
    (let ((patient-stats (get-patient-refill-stats patient)))
      (map-set patient-refill-stats 
        {patient: patient}
        {
          total-refills: (get total-refills patient-stats),
          active-prescriptions: (+ (get active-prescriptions patient-stats) u1),
          last-refill-date: (get last-refill-date patient-stats)
        }
      )
    )
    
    ;; Emit event
    (print {
      event: "refill-rights-initialized",
      prescription-id: prescription-id,
      patient: patient,
      refills-allowed: refills-allowed,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

;; Process a refill (patients only)
(define-public (process-refill 
  (prescription-id uint)
  (patient principal)
  (quantity uint))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Validate inputs
    (asserts! (> prescription-id u0) err-invalid-prescription-id)
    (asserts! (is-valid-quantity quantity) err-invalid-quantity)
    
    ;; Check if prescription is valid
    (asserts! (unwrap! (is-prescription-valid prescription-id) err-external-contract-error) err-prescription-inactive)
    
    ;; Get prescription details to verify patient
    (let ((prescription-data (unwrap! (get-prescription-details prescription-id) err-prescription-not-found)))
      ;; Verify the patient matches the prescription
      (asserts! (is-eq patient (get patient prescription-data)) err-not-prescription-patient)
      
      ;; Get refill rights
      (let ((refill-data (unwrap! (get-refill-rights prescription-id patient) err-refill-rights-not-found)))
        ;; Check if refill rights are active
        (asserts! (get active refill-data) err-refill-rights-not-found)
        
        ;; Check if refills are available
        (asserts! (> (get refills-allowed refill-data) (get refills-used refill-data)) err-no-refills-remaining)
        
        ;; Calculate new refill number
        (let ((new-refill-number (+ (get refills-used refill-data) u1)))
          ;; Record dispensation event
          (let ((dispensation-result (record-dispensation-event prescription-id patient quantity)))
            (match dispensation-result
              dispensation-id 
                (begin
                  ;; Update refill rights
                  (map-set refill-rights 
                    {prescription-id: prescription-id, patient: patient}
                    (merge refill-data {
                      refills-used: new-refill-number,
                      last-refill-date: stacks-block-height
                    })
                  )
                  
                  ;; Record refill history
                  (map-set refill-history 
                    {prescription-id: prescription-id, refill-number: new-refill-number}
                    {
                      patient: patient,
                      quantity: quantity,
                      refill-date: stacks-block-height,
                      dispensation-id: dispensation-id
                    }
                  )
                  
                  ;; Update patient stats
                  (let ((patient-stats (get-patient-refill-stats patient)))
                    (map-set patient-refill-stats 
                      {patient: patient}
                      {
                        total-refills: (+ (get total-refills patient-stats) u1),
                        active-prescriptions: (get active-prescriptions patient-stats),
                        last-refill-date: stacks-block-height
                      }
                    )
                  )
                  
                  ;; Emit event
                  (print {
                    event: "refill-processed",
                    prescription-id: prescription-id,
                    patient: patient,
                    refill-number: new-refill-number,
                    quantity: quantity,
                    dispensation-id: dispensation-id,
                    remaining-refills: (- (get refills-allowed refill-data) new-refill-number),
                    block-height: stacks-block-height
                  })
                  
                  (ok new-refill-number)
                )
              error-code (err err-external-contract-error)
            )
          )
        )
      )
    )
  )
)

;; Deactivate refill rights (admin or prescription registry only)
(define-public (deactivate-refill-rights (prescription-id uint) (patient principal))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Only admin or prescription registry can deactivate refill rights
    (asserts! 
      (or 
        (is-eq contract-caller contract-owner)
        (is-eq contract-caller prescription-registry-contract)
      ) 
      err-unauthorized
    )
    
    ;; Get refill rights
    (let ((refill-data (unwrap! (get-refill-rights prescription-id patient) err-refill-rights-not-found)))
      ;; Deactivate refill rights
      (map-set refill-rights 
        {prescription-id: prescription-id, patient: patient}
        (merge refill-data {active: false})
      )
      
      ;; Update patient stats
      (let ((patient-stats (get-patient-refill-stats patient)))
        (map-set patient-refill-stats 
          {patient: patient}
          {
            total-refills: (get total-refills patient-stats),
            active-prescriptions: (- (get active-prescriptions patient-stats) u1),
            last-refill-date: (get last-refill-date patient-stats)
          }
        )
      )
      
      ;; Emit event
      (print {
        event: "refill-rights-deactivated",
        prescription-id: prescription-id,
        patient: patient,
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
