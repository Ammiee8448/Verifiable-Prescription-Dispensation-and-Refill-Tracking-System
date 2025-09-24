;; Title: Audit DAO Contract
;; Description: Governance and audit contract for regulatory oversight
;; Version: 1.0.0
;; Author: Stacks Developer
;; License: MIT

;; This contract provides governance and regulatory oversight through
;; auditor registration, proposal voting, and audit report submission.

;; ===== CONSTANTS =====

;; Contract owner (system administrator)
(define-constant contract-owner tx-sender)

;; Error codes - Authorization (100-199)
(define-constant err-unauthorized (err u100))
(define-constant err-auditor-not-registered (err u101))
(define-constant err-auditor-already-registered (err u102))
(define-constant err-not-proposal-creator (err u103))

;; Error codes - Validation (200-299)
(define-constant err-invalid-title (err u200))
(define-constant err-invalid-description (err u201))
(define-constant err-invalid-deadline (err u202))
(define-constant err-invalid-proposal-type (err u203))
(define-constant err-invalid-severity (err u204))
(define-constant err-invalid-license-number (err u205))

;; Error codes - Business Logic (300-399)
(define-constant err-proposal-not-found (err u300))
(define-constant err-proposal-expired (err u301))
(define-constant err-proposal-already-executed (err u302))
(define-constant err-already-voted (err u303))
(define-constant err-audit-report-not-found (err u304))

;; Constants for validation
(define-constant min-title-length u5)
(define-constant max-title-length u100)
(define-constant min-description-length u10)
(define-constant max-description-length u500)
(define-constant min-deadline-period u144) ;; ~1 day in blocks
(define-constant max-deadline-period u14400) ;; ~100 days in blocks
(define-constant min-license-length u5)
(define-constant max-license-length u50)

;; ===== DATA STRUCTURES =====

;; Counters for generating unique IDs
(define-data-var proposal-counter uint u0)
(define-data-var audit-report-counter uint u0)

;; Emergency stop mechanism
(define-data-var contract-active bool true)

;; Map to store registered auditors
(define-map auditors
  {auditor: principal}
  {
    license-number: (string-ascii 50),
    registered-at: uint,
    registered-by: principal,
    active: bool,
    reputation-score: uint
  }
)

;; Map to store governance proposals
(define-map proposals
  {proposal-id: uint}
  {
    title: (string-ascii 100),
    description: (string-ascii 500),
    creator: principal,
    created-at: uint,
    deadline: uint,
    proposal-type: (string-ascii 20),
    votes-for: uint,
    votes-against: uint,
    executed: bool,
    active: bool
  }
)

;; Map to track votes on proposals
(define-map proposal-votes
  {proposal-id: uint, voter: principal}
  {
    vote: bool, ;; true = for, false = against
    voted-at: uint
  }
)

;; Map to store audit reports
(define-map audit-reports
  {report-id: uint}
  {
    auditor: principal,
    target-contract: (string-ascii 50),
    severity: (string-ascii 20),
    description: (string-ascii 500),
    submitted-at: uint,
    reviewed: bool,
    approved: bool
  }
)

;; Map to track auditor statistics
(define-map auditor-stats
  {auditor: principal}
  {
    proposals-created: uint,
    votes-cast: uint,
    reports-submitted: uint,
    last-activity: uint
  }
)

;; ===== PRIVATE FUNCTIONS =====

;; Check if contract is active (emergency stop mechanism)
(define-private (require-active-contract)
  (ok (asserts! (var-get contract-active) (err u400)))
)

;; Validate title
(define-private (is-valid-title (title (string-ascii 100)))
  (let ((title-length (len title)))
    (and 
      (>= title-length min-title-length)
      (<= title-length max-title-length)
    )
  )
)

;; Validate description
(define-private (is-valid-description (description (string-ascii 500)))
  (let ((description-length (len description)))
    (and 
      (>= description-length min-description-length)
      (<= description-length max-description-length)
    )
  )
)

;; Validate deadline
(define-private (is-valid-deadline (deadline uint))
  (let ((current-block stacks-block-height)
        (deadline-period (- deadline current-block)))
    (and 
      (> deadline current-block)
      (>= deadline-period min-deadline-period)
      (<= deadline-period max-deadline-period)
    )
  )
)

;; Validate proposal type
(define-private (is-valid-proposal-type (proposal-type (string-ascii 20)))
  (or 
    (is-eq proposal-type "policy")
    (is-eq proposal-type "upgrade")
    (is-eq proposal-type "emergency")
    (is-eq proposal-type "audit")
  )
)

;; Validate severity
(define-private (is-valid-severity (severity (string-ascii 20)))
  (or 
    (is-eq severity "low")
    (is-eq severity "medium")
    (is-eq severity "high")
    (is-eq severity "critical")
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

;; Check if auditor is registered
(define-read-only (is-auditor-registered (auditor principal))
  (match (map-get? auditors {auditor: auditor})
    auditor-data (get active auditor-data)
    false
  )
)

;; Get auditor details
(define-read-only (get-auditor-details (auditor principal))
  (map-get? auditors {auditor: auditor})
)

;; Get proposal details
(define-read-only (get-proposal (proposal-id uint))
  (map-get? proposals {proposal-id: proposal-id})
)

;; Get vote details
(define-read-only (get-vote (proposal-id uint) (voter principal))
  (map-get? proposal-votes {proposal-id: proposal-id, voter: voter})
)

;; Get audit report details
(define-read-only (get-audit-report (report-id uint))
  (map-get? audit-reports {report-id: report-id})
)

;; Get auditor statistics
(define-read-only (get-auditor-stats (auditor principal))
  (default-to 
    {proposals-created: u0, votes-cast: u0, reports-submitted: u0, last-activity: u0}
    (map-get? auditor-stats {auditor: auditor})
  )
)

;; Get current counters
(define-read-only (get-counters)
  {
    proposal-counter: (var-get proposal-counter),
    audit-report-counter: (var-get audit-report-counter)
  }
)

;; Get contract status
(define-read-only (get-contract-status)
  {
    active: (var-get contract-active),
    proposal-count: (var-get proposal-counter),
    audit-report-count: (var-get audit-report-counter),
    current-block: stacks-block-height
  }
)

;; ===== PUBLIC FUNCTIONS =====

;; Register an auditor (admin only)
(define-public (register-auditor (auditor principal) (license-number (string-ascii 50)))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))
    
    ;; Only contract owner can register auditors
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    
    ;; Validate license number
    (asserts! (is-valid-license-number license-number) err-invalid-license-number)
    
    ;; Check if auditor is not already registered
    (asserts! (not (is-auditor-registered auditor)) err-auditor-already-registered)
    
    ;; Register auditor
    (map-set auditors 
      {auditor: auditor}
      {
        license-number: license-number,
        registered-at: stacks-block-height,
        registered-by: contract-caller,
        active: true,
        reputation-score: u100 ;; Starting reputation
      }
    )
    
    ;; Initialize auditor stats
    (map-set auditor-stats 
      {auditor: auditor}
      {
        proposals-created: u0,
        votes-cast: u0,
        reports-submitted: u0,
        last-activity: stacks-block-height
      }
    )
    
    ;; Emit event
    (print {
      event: "auditor-registered",
      auditor: auditor,
      license-number: license-number,
      registered-by: contract-caller,
      block-height: stacks-block-height
    })
    
    (ok true)
  )
)

;; Create a governance proposal (registered auditors only)
(define-public (create-proposal 
  (title (string-ascii 100))
  (description (string-ascii 500))
  (deadline uint)
  (proposal-type (string-ascii 20)))
  (let ((proposal-id (+ (var-get proposal-counter) u1))
        (auditor-stats-data (get-auditor-stats contract-caller)))
    (begin
      ;; Check contract is active
      (try! (require-active-contract))
      
      ;; Only registered auditors can create proposals
      (asserts! (is-auditor-registered contract-caller) err-auditor-not-registered)
      
      ;; Validate inputs
      (asserts! (is-valid-title title) err-invalid-title)
      (asserts! (is-valid-description description) err-invalid-description)
      (asserts! (is-valid-deadline deadline) err-invalid-deadline)
      (asserts! (is-valid-proposal-type proposal-type) err-invalid-proposal-type)
      
      ;; Create proposal
      (map-set proposals 
        {proposal-id: proposal-id}
        {
          title: title,
          description: description,
          creator: contract-caller,
          created-at: stacks-block-height,
          deadline: deadline,
          proposal-type: proposal-type,
          votes-for: u0,
          votes-against: u0,
          executed: false,
          active: true
        }
      )
      
      ;; Update auditor stats
      (map-set auditor-stats 
        {auditor: contract-caller}
        (merge auditor-stats-data {
          proposals-created: (+ (get proposals-created auditor-stats-data) u1),
          last-activity: stacks-block-height
        })
      )
      
      ;; Update counter
      (var-set proposal-counter proposal-id)
      
      ;; Emit event
      (print {
        event: "proposal-created",
        proposal-id: proposal-id,
        title: title,
        creator: contract-caller,
        proposal-type: proposal-type,
        deadline: deadline,
        block-height: stacks-block-height
      })
      
      (ok proposal-id)
    )
  )
)

;; Vote on a proposal (registered auditors only)
(define-public (vote-on-proposal (proposal-id uint) (vote bool))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))

    ;; Only registered auditors can vote
    (asserts! (is-auditor-registered contract-caller) err-auditor-not-registered)

    ;; Get proposal details
    (let ((proposal-data (unwrap! (get-proposal proposal-id) err-proposal-not-found))
          (auditor-stats-data (get-auditor-stats contract-caller)))
      ;; Check if proposal is active and not expired
      (asserts! (get active proposal-data) err-proposal-not-found)
      (asserts! (> (get deadline proposal-data) stacks-block-height) err-proposal-expired)
      (asserts! (not (get executed proposal-data)) err-proposal-already-executed)

      ;; Check if auditor hasn't voted yet
      (asserts! (is-none (get-vote proposal-id contract-caller)) err-already-voted)

      ;; Record vote
      (map-set proposal-votes
        {proposal-id: proposal-id, voter: contract-caller}
        {
          vote: vote,
          voted-at: stacks-block-height
        }
      )

      ;; Update proposal vote counts
      (map-set proposals
        {proposal-id: proposal-id}
        (merge proposal-data {
          votes-for: (if vote (+ (get votes-for proposal-data) u1) (get votes-for proposal-data)),
          votes-against: (if vote (get votes-against proposal-data) (+ (get votes-against proposal-data) u1))
        })
      )

      ;; Update auditor stats
      (map-set auditor-stats
        {auditor: contract-caller}
        (merge auditor-stats-data {
          votes-cast: (+ (get votes-cast auditor-stats-data) u1),
          last-activity: stacks-block-height
        })
      )

      ;; Emit event
      (print {
        event: "vote-cast",
        proposal-id: proposal-id,
        voter: contract-caller,
        vote: vote,
        block-height: stacks-block-height
      })

      (ok true)
    )
  )
)

;; Submit an audit report (registered auditors only)
(define-public (submit-audit-report
  (target-contract (string-ascii 50))
  (severity (string-ascii 20))
  (description (string-ascii 500)))
  (let ((report-id (+ (var-get audit-report-counter) u1))
        (auditor-stats-data (get-auditor-stats contract-caller)))
    (begin
      ;; Check contract is active
      (try! (require-active-contract))

      ;; Only registered auditors can submit reports
      (asserts! (is-auditor-registered contract-caller) err-auditor-not-registered)

      ;; Validate inputs
      (asserts! (is-valid-severity severity) err-invalid-severity)
      (asserts! (is-valid-description description) err-invalid-description)

      ;; Submit audit report
      (map-set audit-reports
        {report-id: report-id}
        {
          auditor: contract-caller,
          target-contract: target-contract,
          severity: severity,
          description: description,
          submitted-at: stacks-block-height,
          reviewed: false,
          approved: false
        }
      )

      ;; Update auditor stats
      (map-set auditor-stats
        {auditor: contract-caller}
        (merge auditor-stats-data {
          reports-submitted: (+ (get reports-submitted auditor-stats-data) u1),
          last-activity: stacks-block-height
        })
      )

      ;; Update counter
      (var-set audit-report-counter report-id)

      ;; Emit event
      (print {
        event: "audit-report-submitted",
        report-id: report-id,
        auditor: contract-caller,
        target-contract: target-contract,
        severity: severity,
        block-height: stacks-block-height
      })

      (ok report-id)
    )
  )
)

;; Review an audit report (admin only)
(define-public (review-audit-report (report-id uint) (approved bool))
  (begin
    ;; Check contract is active
    (try! (require-active-contract))

    ;; Only contract owner can review reports
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)

    ;; Get report details
    (let ((report-data (unwrap! (get-audit-report report-id) err-audit-report-not-found)))
      ;; Update report status
      (map-set audit-reports
        {report-id: report-id}
        (merge report-data {
          reviewed: true,
          approved: approved
        })
      )

      ;; Emit event
      (print {
        event: "audit-report-reviewed",
        report-id: report-id,
        approved: approved,
        reviewed-by: contract-caller,
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
