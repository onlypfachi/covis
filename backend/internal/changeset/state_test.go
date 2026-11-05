package changeset

import "testing"

func TestTransitions(t *testing.T) {
	cases := []struct {
		from, to Status
		ok       bool
	}{
		{Draft, Proposed, true},
		{Proposed, Executing, true},
		{Executing, Validating, true},
		{Validating, ReadyForReview, true},
		{ReadyForReview, Approved, true},
		{Approved, PROpen, true},
		{Approved, PRFailed, true},
		{PRFailed, Approved, true},
		{PROpen, Merged, true},
		{PROpen, PRClosed, true},
		{Failed, Executing, true},
		// Approval cannot be skipped, and nothing merges without a pull request.
		{Proposed, Approved, false},
		{Validating, Approved, false},
		{ReadyForReview, PROpen, false},
		{ReadyForReview, Merged, false},
		{Approved, Merged, false},
		{PRFailed, PROpen, false},
		// Terminal states stay terminal.
		{Merged, Executing, false},
		{PRClosed, PROpen, false},
		{Rejected, Executing, false},
		{Cancelled, Proposed, false},
	}
	for _, c := range cases {
		if got := CanTransition(c.from, c.to); got != c.ok {
			t.Errorf("%s -> %s: got %v want %v", c.from, c.to, got, c.ok)
		}
	}
}

// Only an approved change set can become a pull request, and only an open
// pull request can become merged.
func TestPullRequestGates(t *testing.T) {
	for from := range transitions {
		if CanTransition(from, PROpen) && from != Approved {
			t.Errorf("%s can open a pull request without approval", from)
		}
		if CanTransition(from, Merged) && from != PROpen {
			t.Errorf("%s can reach MERGED without a pull request", from)
		}
	}
}
