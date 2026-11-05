// Package github opens and reads pull requests through the GitHub REST API.
// It is the only way approved change sets leave the platform: a pushed branch
// plus a pull request that a human merges on GitHub.
package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

const DefaultAPIURL = "https://api.github.com"

type PullRequest struct {
	Number         int    `json:"number"`
	URL            string `json:"html_url"`
	State          string `json:"state"` // open | closed
	Merged         bool   `json:"merged"`
	MergeCommitSHA string `json:"merge_commit_sha"`
}

type NewPullRequest struct {
	Title string `json:"title"`
	Head  string `json:"head"`
	Base  string `json:"base"`
	Body  string `json:"body"`
}

type Client struct {
	APIURL string
	Token  string
	HTTP   *http.Client
}

func New(apiURL, token string) *Client {
	if apiURL == "" {
		apiURL = DefaultAPIURL
	}
	return &Client{APIURL: strings.TrimSuffix(apiURL, "/"), Token: token, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

// RepoFromURL extracts owner and repository name from a clone URL. Against
// api.github.com only github.com URLs are accepted; with a custom API URL
// (GitHub Enterprise) the last two path segments are used.
func (c *Client) RepoFromURL(cloneURL string) (owner, name string, err error) {
	raw := strings.TrimSpace(cloneURL)
	host, p := "", raw
	if u, perr := url.Parse(raw); perr == nil && u.Host != "" {
		host, p = u.Hostname(), u.Path
	} else if at := strings.Index(raw, "@"); at >= 0 && strings.Contains(raw[at:], ":") {
		// scp-like: git@github.com:owner/repo.git
		rest := raw[at+1:]
		host, p, _ = strings.Cut(rest, ":")
	}
	if c.APIURL == DefaultAPIURL && host != "github.com" {
		return "", "", fmt.Errorf("%s is not a github.com repository; pull requests need a GitHub remote", cloneURL)
	}
	p = strings.TrimSuffix(strings.Trim(path.Clean("/"+p), "/"), ".git")
	parts := strings.Split(p, "/")
	if len(parts) < 2 || parts[len(parts)-2] == "" || parts[len(parts)-1] == "" {
		return "", "", fmt.Errorf("cannot find owner/repo in %s", cloneURL)
	}
	return parts[len(parts)-2], parts[len(parts)-1], nil
}

// APIError is a non-2xx response from GitHub.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return fmt.Sprintf("github: %d %s", e.Status, e.Message) }

func (c *Client) do(ctx context.Context, method, p string, body, out any) error {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.APIURL+p, r)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("github: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		var e struct {
			Message string `json:"message"`
			Errors  []struct {
				Message string `json:"message"`
			} `json:"errors"`
		}
		_ = json.Unmarshal(data, &e)
		msg := e.Message
		for _, d := range e.Errors {
			msg += ": " + d.Message
		}
		return &APIError{Status: resp.StatusCode, Message: msg}
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

// Create opens a pull request. If one is already open for the same head
// branch (e.g. a retried request), that one is returned instead.
func (c *Client) Create(ctx context.Context, cloneURL string, in NewPullRequest) (*PullRequest, error) {
	owner, name, err := c.RepoFromURL(cloneURL)
	if err != nil {
		return nil, err
	}
	var pr PullRequest
	err = c.do(ctx, http.MethodPost, fmt.Sprintf("/repos/%s/%s/pulls", owner, name), in, &pr)
	var apiErr *APIError
	if errors.As(err, &apiErr) && apiErr.Status == http.StatusUnprocessableEntity {
		var open []PullRequest
		q := url.Values{"head": {owner + ":" + in.Head}, "base": {in.Base}, "state": {"open"}}
		if lerr := c.do(ctx, http.MethodGet, fmt.Sprintf("/repos/%s/%s/pulls?%s", owner, name, q.Encode()), nil, &open); lerr == nil && len(open) > 0 {
			return &open[0], nil
		}
	}
	if err != nil {
		return nil, err
	}
	return &pr, nil
}

func (c *Client) Get(ctx context.Context, cloneURL string, number int) (*PullRequest, error) {
	owner, name, err := c.RepoFromURL(cloneURL)
	if err != nil {
		return nil, err
	}
	var pr PullRequest
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/repos/%s/%s/pulls/%d", owner, name, number), nil, &pr); err != nil {
		return nil, err
	}
	return &pr, nil
}
