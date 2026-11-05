// Package changeset holds the Change Set lifecycle rules. A change set records
// an intended modification; it never mutates the graph, which only changes when
// a merged commit is re-indexed.
package changeset

import "fmt"

type Status string

const (
	Draft          Status = "DRAFT"
	Proposed       Status = "PROPOSED"
	Executing      Status = "EXECUTING"
	Validating     Status = "VALIDATING"
	ReadyForReview Status = "READY_FOR_REVIEW"
	// Approved: a developer approved the diff; the branch is being pushed and
	// a pull request opened. Nothing is ever merged locally.
	Approved Status = "APPROVED"
	PROpen   Status = "PR_OPEN"
	PRFailed Status = "PR_FAILED"
	// Merged and PRClosed reflect what happened to the pull request on GitHub.
	Merged    Status = "MERGED"
	PRClosed  Status = "PR_CLOSED"
	Rejected  Status = "REJECTED"
	Failed    Status = "FAILED"
	Cancelled Status = "CANCELLED"
)

var transitions = map[Status][]Status{
	Draft:          {Proposed, Cancelled},
	Proposed:       {Executing, Cancelled, Rejected},
	Executing:      {Validating, Failed, Cancelled},
	Validating:     {ReadyForReview, Failed, Cancelled},
	ReadyForReview: {Approved, Rejected, Executing, Cancelled},
	Approved:       {PROpen, PRFailed},
	// Pushing or opening the PR failed; retrying keeps the same approval.
	PRFailed: {Approved, Cancelled, Rejected},
	PROpen:   {Merged, PRClosed},
	// Failed agent runs can be retried; history is kept as new executions.
	Failed: {Executing, Cancelled, Rejected},
}

func CanTransition(from, to Status) bool {
	for _, s := range transitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

func Transition(from, to Status) error {
	if !CanTransition(from, to) {
		return fmt.Errorf("invalid change set transition %s -> %s", from, to)
	}
	return nil
}

func (s Status) Terminal() bool {
	return s == Merged || s == PRClosed || s == Rejected || s == Cancelled
}
