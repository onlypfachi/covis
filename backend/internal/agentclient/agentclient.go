// Package agentclient talks to the TypeScript agent-worker, which runs the
// Claude Agent SDK inside a change set's worktree. The worker never touches git
// history; it only edits files. The Go side owns commits and merges.
package agentclient

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

type ContextNode struct {
	Key       string `json:"key"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	FilePath  string `json:"filePath"`
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
	Selected  bool   `json:"selected"`
	// Relation describes how a neighbour relates to the selection, e.g. "calls".
	Relation string `json:"relation,omitempty"`
}

type RunRequest struct {
	RunID              string        `json:"runId"`
	WorktreePath       string        `json:"worktreePath"`
	Request            string        `json:"request"`
	AcceptanceCriteria string        `json:"acceptanceCriteria"`
	BaseCommit         string        `json:"baseCommit"`
	Nodes              []ContextNode `json:"nodes"`
}

// Event is one NDJSON line from the worker. The final line has Type "result".
type Event map[string]any

func (e Event) Type() string { s, _ := e["type"].(string); return s }

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

func New(baseURL string) *Client {
	// No overall timeout: runs stream for minutes. The worker enforces its own limit.
	return &Client{BaseURL: baseURL, HTTP: &http.Client{}}
}

// Run starts an agent run and calls onEvent for every streamed event. It
// returns the final result event.
func (c *Client) Run(ctx context.Context, req RunRequest, onEvent func(Event) error) (Event, error) {
	body, _ := json.Marshal(req)
	hreq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/runs", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	hreq.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(hreq)
	if err != nil {
		return nil, fmt.Errorf("agent-worker unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var b bytes.Buffer
		_, _ = b.ReadFrom(resp.Body)
		return nil, fmt.Errorf("agent-worker returned %s: %s", resp.Status, b.String())
	}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64<<10), 8<<20)
	var final Event
	for sc.Scan() {
		if len(bytes.TrimSpace(sc.Bytes())) == 0 {
			continue
		}
		var ev Event
		if err := json.Unmarshal(sc.Bytes(), &ev); err != nil {
			continue
		}
		if ev.Type() == "result" {
			final = ev
		}
		if err := onEvent(ev); err != nil {
			return nil, err
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("agent stream: %w", err)
	}
	if final == nil {
		return nil, fmt.Errorf("agent stream ended without a result")
	}
	return final, nil
}

func (c *Client) Cancel(ctx context.Context, runID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.BaseURL+"/runs/"+url.PathEscape(runID), nil)
	if err != nil {
		return err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}
