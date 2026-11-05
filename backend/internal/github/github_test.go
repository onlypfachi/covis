package github

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRepoFromURL(t *testing.T) {
	gh := New("", "t")
	for in, want := range map[string]string{
		"https://github.com/acme/shop.git":     "acme/shop",
		"https://github.com/acme/shop":         "acme/shop",
		"git@github.com:acme/shop.git":         "acme/shop",
		"ssh://git@github.com/acme/shop.git":   "acme/shop",
		"https://x-token@github.com/acme/shop": "acme/shop",
	} {
		o, n, err := gh.RepoFromURL(in)
		if err != nil || o+"/"+n != want {
			t.Errorf("%s -> %s/%s, %v; want %s", in, o, n, err, want)
		}
	}
	for _, bad := range []string{"https://gitlab.com/acme/shop.git", "/tmp/repo", "https://github.com/acme"} {
		if _, _, err := gh.RepoFromURL(bad); err == nil {
			t.Errorf("%s accepted", bad)
		}
	}
	// GitHub Enterprise (custom API URL) accepts its own host.
	ghe := New("https://ghe.example.com/api/v3", "t")
	if o, n, err := ghe.RepoFromURL("https://ghe.example.com/team/app.git"); err != nil || o != "team" || n != "app" {
		t.Errorf("enterprise: %s/%s %v", o, n, err)
	}
}

func TestCreateAndReuseExisting(t *testing.T) {
	var auth string
	creates := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/repos/acme/shop/pulls":
			var in NewPullRequest
			_ = json.NewDecoder(r.Body).Decode(&in)
			creates++
			if creates > 1 {
				w.WriteHeader(http.StatusUnprocessableEntity)
				_, _ = w.Write([]byte(`{"message":"Validation Failed","errors":[{"message":"A pull request already exists for acme:covis/cs-1."}]}`))
				return
			}
			_ = json.NewEncoder(w).Encode(PullRequest{Number: 7, URL: "https://github.com/acme/shop/pull/7", State: "open"})
		case r.Method == http.MethodGet && r.URL.Path == "/repos/acme/shop/pulls" && r.URL.Query().Get("head") == "acme:covis/cs-1":
			_ = json.NewEncoder(w).Encode([]PullRequest{{Number: 7, URL: "https://github.com/acme/shop/pull/7", State: "open"}})
		case r.Method == http.MethodGet && r.URL.Path == "/repos/acme/shop/pulls/7":
			_ = json.NewEncoder(w).Encode(PullRequest{Number: 7, State: "closed", Merged: true, MergeCommitSHA: "abc"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL, "secret")
	ctx := context.Background()
	in := NewPullRequest{Title: "t", Head: "covis/cs-1", Base: "main"}
	pr, err := c.Create(ctx, "https://github.com/acme/shop.git", in)
	if err != nil || pr.Number != 7 {
		t.Fatalf("create: %+v %v", pr, err)
	}
	if auth != "Bearer secret" {
		t.Fatalf("auth header = %q", auth)
	}
	pr, err = c.Create(ctx, "https://github.com/acme/shop.git", in)
	if err != nil || pr.Number != 7 {
		t.Fatalf("existing PR not reused: %+v %v", pr, err)
	}
	pr, err = c.Get(ctx, "https://github.com/acme/shop.git", 7)
	if err != nil || !pr.Merged || pr.MergeCommitSHA != "abc" {
		t.Fatalf("get: %+v %v", pr, err)
	}
	if _, err := c.Get(ctx, "https://github.com/acme/shop.git", 8); err == nil {
		t.Fatal("expected 404 error")
	}
}
