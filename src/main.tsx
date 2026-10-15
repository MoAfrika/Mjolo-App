import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import {
  Heart,
  Compass,
  MessageCircle,
  CalendarDays,
  UserRound,
  ArrowUpRight,
  ArrowRight,
  SlidersHorizontal,
  MapPin,
  ShieldCheck,
  X,
  Send,
  Sun,
  Moon,
  LogOut,
  Camera,
  Check,
  ChevronLeft,
  Flag,
  Ban,
  Download,
  Sparkles,
  Plus,
  RefreshCw,
  Leaf,
  WifiOff,
  LockKeyhole,
} from "lucide-react";
import {
  supabase,
  configured,
  rpc,
  account,
  provinces,
  intentions,
  dateLabel,
  money,
  samePage,
  compressPhoto,
  copy,
  type Profile,
  type Me,
  type Match,
  type Message,
  type Plan,
  type Photo,
} from "./lib";
import "./style.css";
const fail = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
function BrandFlower() {
  return (
    <svg
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M20 3v11m0 12v11M3 20h11m12 0h11M8 8l8 8m8 8 8 8M8 32l8-8m8-8 8-8" />
      <circle cx="20" cy="20" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function Logo() {
  return (
    <a className="brand" href="/" aria-label="Mjolo home">
      mjolo
      <span>
        <BrandFlower />
      </span>
    </a>
  );
}
function PhotoView({
  photo,
  alt,
  className = "",
  lowData = false,
}: {
  photo?: Photo;
  alt: string;
  className?: string;
  lowData?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [visible, setVisible] = useState(!lowData);
  const [failed, setFailed] = useState(false);
  const host = useRef<Element | null>(null);
  useEffect(() => {
    if (!lowData || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [lowData, photo?.path]);
  useEffect(() => {
    let live = true;
    let objectUrl = "";
    setUrl("");
    setFailed(false);
    if (photo && supabase && visible) {
      supabase.storage
        .from("profile-photos")
        .download(photo.path)
        .then(({ data }) => {
          if (!data && live) setFailed(true);
          if (data && live) {
            objectUrl = URL.createObjectURL(data);
            setUrl(objectUrl);
          }
        });
    }
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo?.path, visible]);
  return url ? (
    <img
      ref={(node) => {
        host.current = node;
      }}
      className={className}
      src={url}
      alt={alt}
      loading={lowData ? "lazy" : "eager"}
      decoding="async"
    />
  ) : (
    <div
      ref={(node) => {
        host.current = node;
      }}
      className={`photo-placeholder ${className}`}
      role="img"
      aria-label={alt}
    >
      <UserRound size={44} />
      <span>
        {photo
          ? failed
            ? "Photo unavailable · retry by reloading"
            : "Loading photo…"
          : "Your story starts here"}
      </span>
    </div>
  );
}
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [boot, setBoot] = useState(true),
    [me, setMe] = useState<Me | null>(null),
    [tab, setTab] = useState("Discover"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [theme, setTheme] = useState(
      localStorage.getItem("mjolo-theme") || "light",
    ),
    [recovery, setRecovery] = useState(
      location.hash.includes("type=recovery") ||
        location.search.includes("recovery=1"),
    );
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [likes, setLikes] = useState<Profile[]>([]),
    [matches, setMatches] = useState<Match[]>([]),
    [plans, setPlans] = useState<Plan[]>([]),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [filterOpen, setFilterOpen] = useState(false),
    [selected, setSelected] = useState<Match | null>(null),
    [revision, setRevision] = useState(0),
    [reportTarget, setReportTarget] = useState<Profile | null>(null),
    [focusProfile, setFocusProfile] = useState<Profile | null>(null);
  const notify = (s: string) => {
    setNotice(s);
    setError("");
  };
  const reload = useCallback(async () => {
    if (!supabase) return;
    setMe(await rpc<Me>("get_me"));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mjolo-theme", theme);
  }, [theme]);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  useEffect(() => {
    if (!supabase) {
      setBoot(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBoot(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!s) {
        setMe(null);
        setProfiles([]);
        setLikes([]);
        setMatches([]);
        setPlans([]);
        setSelected(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session) reload().catch((e) => setError(fail(e)));
  }, [session?.user.id, reload]);
  const refresh = useCallback(async () => {
    if (!me?.verified || me.must_change_password || me.status !== "active")
      return;
    const [m, l] = await Promise.all([
      rpc<Match[]>("my_matches"),
      rpc<Profile[]>("my_likes"),
    ]);
    setMatches(m);
    setLikes(l);
    if (selected && !m.some((v) => v.id === selected.id)) setSelected(null);
    if (me.complete) {
      const d = await rpc<Profile[]>("discover", { filters });
      setProfiles(d);
    }
    const { data, error } = await supabase!
      .from("date_plans")
      .select("*")
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    setPlans(data || []);
  }, [me, JSON.stringify(filters), selected?.id]);
  useEffect(() => {
    if (!session || !me) return;
    setLoading(true);
    refresh()
      .catch((e) => setError(fail(e)))
      .finally(() => setLoading(false));
  }, [me, JSON.stringify(filters), revision]);
  useEffect(() => {
    if (!session || !me?.verified || me.must_change_password) return;
    let live = true;
    const update = () => {
      if (live) {
        setRevision((v) => v + 1);
      }
    };
    const c = supabase!
      .channel(`mjolo-${session.user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        update,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        update,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "date_plans" },
        update,
      )
      .subscribe();
    const timer = setInterval(update, 15000);
    return () => {
      live = false;
      clearInterval(timer);
      void supabase!.removeChannel(c);
    };
  }, [session?.user.id, me?.verified, me?.must_change_password]);
  async function act(fn: () => Promise<void>) {
    if (offline) {
      setError("You are offline. Reconnect before trying again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(fail(e));
    } finally {
      setLoading(false);
    }
  }
  const signout = () =>
    act(async () => {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;
      setTab("Discover");
      setRecovery(false);
      history.replaceState(null, "", "/");
      notify("You have safely signed out.");
    });
  async function swipe(p: Profile, choice: string) {
    await act(async () => {
      const r = await rpc<{ match_id: string | null }>("swipe", {
        target_id: p.id,
        choice,
      });
      setProfiles((v) => v.filter((x) => x.id !== p.id));
      if (r.match_id)
        notify(`It's mutual. You and ${p.display_name} can say hello.`);
      else if (choice === "like")
        notify("Like sent. A conversation opens when the feeling is mutual.");
      setRevision((v) => v + 1);
    });
  }
  const ready =
    me?.verified && !me.must_change_password && me.status === "active";
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      {offline && (
        <div className="offline">
          <WifiOff size={16} /> You're offline. Your unsent text stays here;
          reconnect to send.
        </div>
      )}
      <header className="topbar">
        <Logo />
        {session && ready && (
          <nav className="desktop-nav" aria-label="Main navigation">
            {["Discover", "Likes", "Chats", "Plans", "You"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  setTab(t);
                  setSelected(null);
                }}
              >
                {t}
              </button>
            ))}
          </nav>
        )}
        <div className="header-actions">
          <span className="south-africa">
            MADE FOR SOUTH AFRICA <ArrowUpRight size={11} aria-hidden="true" />
          </span>
          <button
            className="icon-button"
            aria-label="Toggle colour theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
          </button>
          {session && (
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={signout}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      {(error || notice) && (
        <div
          className={`toast ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <main id="main">
        {boot ? (
          <div className="empty">
            <div className="spinner" />
            Finding your place…
          </div>
        ) : !configured ? (
          <div className="setup-page">
            <span className="eyebrow">THE NEXT CHAPTER</span>
            <h1>
              A little setup.
              <br />A lot of possibility.
            </h1>
            <p>
              This app needs its Supabase project connection. No demo accounts
              or simulated connections are enabled.
            </p>
            <p>
              Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then
              follow the deployment guide for server settings and migrations.
            </p>
          </div>
        ) : !session ? (
          <Auth onNotice={notify} onError={setError} />
        ) : !me ? (
          <div className="empty">
            <h2>Connecting your account</h2>
            <button className="primary" onClick={() => void act(reload)}>
              Retry account connection
            </button>
          </div>
        ) : recovery || me.must_change_password ? (
          <PasswordChange
            initial={me.must_change_password}
            onDone={() => {
              setRecovery(false);
              history.replaceState(null, "", "/");
              void reload();
              notify("Password updated.");
            }}
            onError={setError}
          />
        ) : !me.verified ? (
          <section className="narrow verify">
            <ShieldCheck size={42} />
            <span className="eyebrow">ONE IMPORTANT STEP</span>
            <h1>Make it official.</h1>
            <p>
              Check {session.user.email} for your verification link. The badge
              confirms your email address, not your identity or background.
            </p>
            <button
              className="primary"
              disabled={loading}
              onClick={() =>
                void act(async () => {
                  const { error } = await supabase!.auth.resend({
                    type: "signup",
                    email: session.user.email!,
                    options: { emailRedirectTo: location.origin },
                  });
                  if (error) throw error;
                  notify("Verification email sent.");
                })
              }
            >
              Resend verification
            </button>
            <button className="text-button" onClick={() => void act(reload)}>
              I've verified my email · Continue
            </button>
          </section>
        ) : me.status !== "active" ? (
          <div className="empty">
            <ShieldCheck />
            <h1>Account suspended</h1>
            <p>
              Contact the service operator using the published privacy contact
              to request a review.
            </p>
          </div>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <span className="eyebrow">
                  {tab === "Discover"
                    ? "LESS SCROLLING. MORE SPARK."
                    : tab === "You"
                      ? "BE UNAPOLOGETICALLY YOU."
                      : "GOOD THINGS START HERE."}
                </span>
                <h1>
                  {tab === "Discover" ? (
                    <>
                      Your people.
                      <br className="mobile-break" /> Your possibility
                      <span>.</span>
                    </>
                  ) : tab === "Likes" ? (
                    "A little spark."
                  ) : tab === "Chats" ? (
                    "A proper introduction."
                  ) : tab === "Plans" ? (
                    "Take it into the real world."
                  ) : (
                    "Your story, in your words."
                  )}
                </h1>
                <p>
                  {tab === "Discover"
                    ? "Thoughtful connections, a little closer to home."
                    : tab === "Likes"
                      ? "The people you’ve liked. When it’s mutual, you can talk."
                      : tab === "Chats"
                        ? "Only mutual matches can start a conversation."
                        : tab === "Plans"
                          ? "Public places. Shared plans. Your pace."
                          : "Share what matters. Keep the rest yours."}
                </p>
              </div>
              {tab === "Discover" && (
                <button
                  className={`secondary filter-button ${filterOpen ? "selected" : ""}`}
                  onClick={() => setFilterOpen(!filterOpen)}
                  aria-expanded={filterOpen}
                >
                  <SlidersHorizontal size={17} /> Your preferences
                </button>
              )}
            </section>
            {!me.complete && tab !== "You" && (
              <div className="completion">
                <Sparkles />
                <div>
                  <strong>Your introduction comes first.</strong>
                  <p>
                    Complete your profile and add a photo to appear in
                    discovery.
                  </p>
                </div>
                <button className="primary" onClick={() => setTab("You")}>
                  Complete profile <ArrowRight size={16} />
                </button>
              </div>
            )}
            {tab === "Discover" && (
              <>
                {filterOpen && (
                  <form
                    className="filter-panel"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      setFilters(
                        Object.fromEntries(
                          [...f.entries()].map(([k, v]) => [k, String(v)]),
                        ),
                      );
                      setFilterOpen(false);
                    }}
                  >
                    <Field label="Province">
                      <select name="province" defaultValue={filters.province}>
                        <option value="">All South Africa</option>
                        {provinces.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="City">
                      <input
                        name="city"
                        defaultValue={filters.city}
                        placeholder="Any city"
                        maxLength={80}
                      />
                    </Field>
                    <Field label="Broad area">
                      <input
                        name="area"
                        defaultValue={filters.area}
                        placeholder="e.g. Rosebank"
                        maxLength={100}
                      />
                    </Field>
                    <Field label="Minimum age">
                      <input
                        name="min_age"
                        type="number"
                        min="18"
                        max="110"
                        defaultValue={filters.min_age || me.min_age}
                      />
                    </Field>
                    <Field label="Maximum age">
                      <input
                        name="max_age"
                        type="number"
                        min="18"
                        max="110"
                        defaultValue={filters.max_age || me.max_age}
                      />
                    </Field>
                    <Field label="Looking for">
                      <select
                        name="gender"
                        defaultValue={filters.gender || me.seeking}
                      >
                        <option value="everyone">Everyone</option>
                        <option value="woman">Women</option>
                        <option value="man">Men</option>
                        <option value="nonbinary">Nonbinary people</option>
                      </select>
                    </Field>
                    <Field label="Intentions">
                      <select
                        name="intentions"
                        defaultValue={filters.intentions}
                      >
                        <option value="">All intentions</option>
                        {intentions.map((i) => (
                          <option key={i}>{i}</option>
                        ))}
                      </select>
                    </Field>
                    <button className="primary" type="submit">
                      Apply preferences
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setFilters({})}
                    >
                      Reset filters
                    </button>
                  </form>
                )}
                <div className="discover-layout">
                  <section>
                    <div className="section-meta">
                      <span>
                        <span className="live-dot" />
                        {me.paused
                          ? "Discovery paused for your profile"
                          : "A fresh perspective"}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setRevision((v) => v + 1)}
                      >
                        <RefreshCw size={14} /> Refresh
                      </button>
                    </div>
                    {loading && !profiles.length ? (
                      <div className="skeleton" aria-label="Loading profiles" />
                    ) : profiles.length ? (
                      <div className="profile-grid">
                        {profiles.map((p, i) => (
                          <ProfileCard
                            key={p.id}
                            p={p}
                            me={me}
                            primary={i === 0}
                            onLike={() => void swipe(p, "like")}
                            onPass={() => void swipe(p, "pass")}
                            onDetails={() => setFocusProfile(p)}
                            onReport={() => setReportTarget(p)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="empty discovery-empty">
                        <div className="empty-orbit">
                          <Heart size={32} />
                        </div>
                        <span className="eyebrow">
                          MAKE ROOM FOR THE RIGHT ONE
                        </span>
                        <h2>{copy.en.empty}</h2>
                        <p>
                          {me.complete
                            ? "No new eligible profiles match your preferences yet. Try a wider area or return later."
                            : "Your next chapter begins with a complete profile."}
                        </p>
                        <button
                          className="secondary"
                          onClick={() =>
                            me.complete ? setFilterOpen(true) : setTab("You")
                          }
                        >
                          {me.complete
                            ? "Explore your preferences"
                            : "Tell your story"}{" "}
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    )}
                  </section>
                  <aside className="editorial-aside">
                    <div className="quote-card">
                      <span className="tiny-star">
                        <BrandFlower />
                      </span>
                      <span className="eyebrow">SAME PAGE</span>
                      <h2>
                        Shared intentions.
                        <br />
                        Better beginnings.
                      </h2>
                      <p>
                        Compatibility, explained through what you’ve both chosen
                        to share. No mystery scores.
                      </p>
                      <div className="fine-line" />
                      <span className="small-caps">
                        REAL CHEMISTRY STARTS WITH YOU
                      </span>
                    </div>
                    <div className="safety-note">
                      <ShieldCheck size={23} />
                      <div>
                        <h3>A little care goes a long way.</h3>
                        <p>
                          Meet somewhere public. Tell someone you trust. A
                          verification badge only means an email is confirmed.
                        </p>
                      </div>
                    </div>
                    <div className="low-data">
                      <Leaf size={16} />
                      <span>
                        {me.low_data
                          ? "Low-data mode is on"
                          : "Less noise. More connection."}
                      </span>
                    </div>
                  </aside>
                </div>
              </>
            )}
            {tab === "Likes" && (
              <>
                {likes.length ? (
                  <div className="profile-grid likes-grid">
                    {likes.map((p) => (
                      <ProfileCard
                        key={p.id}
                        p={p}
                        me={me}
                        onDetails={() => setFocusProfile(p)}
                        onReport={() => setReportTarget(p)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={<Heart />}
                    title="A spark starts with hello."
                    text="Likes you send appear here. Browse discovery when you’re ready."
                  />
                )}
              </>
            )}
            {tab === "Chats" &&
              (selected ? (
                <Chat
                  match={selected}
                  me={me}
                  revision={revision}
                  onBack={() => setSelected(null)}
                  onError={setError}
                  onPlan={() => {
                    setTab("Plans");
                  }}
                  onReport={() => setReportTarget(selected.profile)}
                />
              ) : (
                <div className="matches-list">
                  {matches.length ? (
                    matches.map((m) => (
                      <button
                        className="match-row"
                        key={m.id}
                        onClick={() => setSelected(m)}
                      >
                        <PhotoView
                          photo={m.profile.photos[0]}
                          alt={m.profile.display_name}
                        />
                        <div>
                          <h3>{m.profile.display_name}</h3>
                          <p>{m.profile.intentions} · Say hello</p>
                        </div>
                        <MessageCircle size={20} />
                        <ArrowUpRight size={20} />
                      </button>
                    ))
                  ) : (
                    <Empty
                      icon={<MessageCircle />}
                      title="A conversation worth having."
                      text="Like each other to open a private conversation. There are no random matches here."
                    />
                  )}
                </div>
              ))}
            {tab === "Plans" && (
              <Plans
                plans={plans}
                matches={matches}
                me={me}
                onRefresh={() => setRevision((v) => v + 1)}
                onError={setError}
                onNotice={notify}
              />
            )}
            {tab === "You" && (
              <ProfileEditor
                me={me}
                onSaved={(v) => {
                  setMe(v);
                  notify("Your profile has been saved.");
                }}
                onError={setError}
                onNotice={notify}
                onSignout={signout}
              />
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <Logo />
        <span>{copy.en.promise}</span>
        <a href="/privacy.html">Privacy & safety</a>
        <span>18+ · SOUTH AFRICA</span>
      </footer>
      {session && ready && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {[
            [Compass, "Discover"],
            [Heart, "Likes"],
            [MessageCircle, "Chats"],
            [CalendarDays, "Plans"],
            [UserRound, "You"],
          ].map(([Icon, t]) => {
            const I = Icon as typeof Heart;
            return (
              <button
                key={String(t)}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  setTab(String(t));
                  setSelected(null);
                }}
              >
                <I size={21} />
                <span>{String(t)}</span>
              </button>
            );
          })}
        </nav>
      )}
      {reportTarget && (
        <SafetyDialog
          p={reportTarget}
          onClose={() => setReportTarget(null)}
          onError={setError}
          onDone={(text) => {
            setReportTarget(null);
            setFocusProfile(null);
            setRevision((v) => v + 1);
            notify(text);
          }}
        />
      )}
      {focusProfile && (
        <Dialog
          title={`${focusProfile.display_name}, ${focusProfile.age}`}
          onClose={() => setFocusProfile(null)}
        >
          <PhotoView
            photo={focusProfile.photos[0]}
            alt={focusProfile.display_name}
            className="detail-photo"
            lowData={me?.low_data}
          />
          <p>{focusProfile.bio}</p>
          <p>
            <MapPin size={15} />{" "}
            {[focusProfile.area, focusProfile.city, focusProfile.province]
              .filter(Boolean)
              .join(", ")}
          </p>
          <span className="eyebrow">SAME PAGE</span>
          <ul>
            {me && samePage(me, focusProfile).map((s) => <li key={s}>{s}</li>)}
          </ul>
          <div className="chips">
            {focusProfile.interests.map((i) => (
              <span key={i}>{i}</span>
            ))}
          </div>
          <p>Speaks {focusProfile.languages.join(", ")} · Email confirmed</p>
          <div className="photo-strip">
            {focusProfile.photos.slice(1).map((p) => (
              <PhotoView
                key={p.id}
                photo={p}
                alt={`${focusProfile.display_name}'s additional photo`}
              />
            ))}
          </div>
          <button
            className="text-button danger"
            onClick={() => {
              setReportTarget(focusProfile);
              setFocusProfile(null);
            }}
          >
            Report or block
          </button>
        </Dialog>
      )}
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children as React.ReactElement<{ id?: string }>, {
        id,
      })}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Auth({
  onNotice,
  onError,
}: {
  onNotice: (s: string) => void;
  onError: (s: string) => void;
}) {
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    onError("");
    const f = new FormData(e.currentTarget);
    try {
      const email = String(f.get("email")).trim();
      if (mode === "register") {
        const password = String(f.get("password"));
        if (password !== f.get("confirm"))
          throw Error("Passwords do not match");
        const { error } = await supabase!.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: location.origin,
            data: {
              username: String(f.get("username")).toLowerCase(),
              dob: f.get("dob"),
              adult_consent: f.get("adult") === "on",
              terms_consent: f.get("terms") === "on",
            },
          },
        });
        if (error) throw error;
        onNotice("Check your email for a verification link, then sign in.");
        setMode("login");
      } else if (mode === "forgot") {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/?recovery=1`,
        });
        if (error) throw error;
        onNotice(
          "If an account exists, password recovery instructions will arrive by email.",
        );
      } else {
        const { error } = await supabase!.auth.signInWithPassword({
          email,
          password: String(f.get("password")),
        });
        if (error) throw error;
      }
    } catch (e) {
      onError(fail(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-editorial">
        <div className="auth-art" />
        <span className="eyebrow">SOUTH AFRICAN SOUL. REAL CONNECTION.</span>
        <h1>
          Less almost.
          <br />
          More <em>something.</em>
        </h1>
        <p>
          Real chemistry.
          <br />
          Your kind of connection.
        </p>
        <div className="auth-bottom">
          <span className="tiny-star">
            <BrandFlower />
          </span>
          <span>
            From the first hello
            <br />
            to your favourite person.
          </span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <span className="eyebrow">A GOOD PLACE TO BEGIN</span>
        <h2>
          {mode === "register"
            ? "Your next chapter."
            : mode === "forgot"
              ? "Let’s get you back."
              : "Welcome to mjolo."}
        </h2>
        <p>
          {mode === "register"
            ? "A little about you. A world of possibility."
            : "Connections with intention, at your pace."}
        </p>
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Join the circle
          </button>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <Field label="Username">
                <input
                  name="username"
                  required
                  pattern="[a-zA-Z0-9_.]{3,30}"
                  minLength={3}
                  maxLength={30}
                  autoComplete="username"
                  placeholder="Your unique username"
                />
              </Field>
              <Field label="Date of birth · private">
                <input
                  name="dob"
                  required
                  type="date"
                  max={new Date(
                    new Date().setFullYear(new Date().getFullYear() - 18),
                  )
                    .toISOString()
                    .slice(0, 10)}
                />
              </Field>
            </>
          )}
          <Field label="Email address">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              maxLength={254}
            />
          </Field>
          {mode !== "forgot" && (
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 12 : 1}
                maxLength={128}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                placeholder={
                  mode === "register"
                    ? "At least 12 characters"
                    : "Your password"
                }
              />
            </Field>
          )}
          {mode === "register" && (
            <>
              <Field label="Confirm password">
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </Field>
              <label className="check">
                <input name="adult" required type="checkbox" /> I confirm that I
                am at least 18 years old.
              </label>
              <label className="check">
                <input name="terms" required type="checkbox" /> I agree to the
                community rules and{" "}
                <a href="/privacy.html" target="_blank" rel="noreferrer">
                  privacy notice
                </a>
                .
              </label>
            </>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "register"
                ? "Create your account"
                : mode === "forgot"
                  ? "Send recovery link"
                  : "Find your connection"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => setMode(mode === "forgot" ? "login" : "forgot")}
        >
          {mode === "forgot" ? "Back to sign in" : "Forgot your password?"}
        </button>
        {mode === "login" && (
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              const email = window.prompt(
                "Enter your email address to resend verification",
              );
              if (!email) return;
              setBusy(true);
              const { error } = await supabase!.auth.resend({
                type: "signup",
                email,
                options: { emailRedirectTo: location.origin },
              });
              setBusy(false);
              if (error) onError(error.message);
              else
                onNotice(
                  "If verification is required, an email has been sent.",
                );
            }}
          >
            Resend verification email
          </button>
        )}
        <div className="auth-trust">
          <LockKeyhole size={15} /> Adults only. Your contact details stay
          private.
        </div>
      </section>
    </div>
  );
}
function PasswordChange({
  initial,
  onDone,
  onError,
}: {
  initial: boolean;
  onDone: () => void;
  onError: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="narrow">
      <span className="eyebrow">A FRESH START</span>
      <h1>
        {initial
          ? "Secure your administrator account."
          : "Choose a new password."}
      </h1>
      <p>Use a unique password of at least 12 characters.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get("password") !== f.get("confirm")) {
            onError("Passwords do not match");
            return;
          }
          setBusy(true);
          const { error } = await supabase!.auth.updateUser({
            password: String(f.get("password")),
          });
          setBusy(false);
          if (error) onError(error.message);
          else onDone();
        }}
      >
        <Field label="New password">
          <input
            type="password"
            name="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            name="confirm"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <button className="primary" disabled={busy}>
          Update password
        </button>
      </form>
    </section>
  );
}
function ProfileCard({
  p,
  me,
  primary = false,
  onLike,
  onPass,
  onDetails,
  onReport,
}: {
  p: Profile;
  me: Me;
  primary?: boolean;
  onLike?: () => void;
  onPass?: () => void;
  onDetails: () => void;
  onReport: () => void;
}) {
  return (
    <article className={`profile-card ${primary ? "primary-card" : ""}`}>
      <button
        className="profile-photo"
        onClick={onDetails}
        aria-label={`View ${p.display_name}'s profile`}
      >
        <PhotoView
          photo={p.photos[0]}
          alt={p.display_name}
          lowData={me.low_data}
        />
        <span className="photo-shade" />
        <span className="profile-location">
          <MapPin size={13} />
          {p.city || p.province}
        </span>
        <span className="profile-caption">
          <span>
            {p.display_name}, {p.age}
          </span>
          <small>{p.intentions}</small>
        </span>
        <span className="profile-expand">
          <ArrowUpRight size={20} />
        </span>
      </button>
      <div className="profile-card-body">
        <span className="micro-label">
          <ShieldCheck size={13} /> EMAIL CONFIRMED
        </span>
        <p className="profile-bio">{p.bio}</p>
        <div className="chips">
          {p.interests.slice(0, 3).map((i) => (
            <span key={i}>{i}</span>
          ))}
        </div>
        {samePage(me, p).length > 0 && (
          <p className="compatibility">
            <Sparkles size={14} />
            {samePage(me, p)[0]}
          </p>
        )}
        <div className="card-actions">
          {onPass && (
            <button
              className="round-button"
              aria-label={`Pass on ${p.display_name}`}
              onClick={onPass}
            >
              <X />
            </button>
          )}
          {onLike && (
            <button className="like-button" onClick={onLike}>
              <Heart size={19} /> A little spark
            </button>
          )}
          <button
            className="icon-button"
            aria-label={`Safety options for ${p.display_name}`}
            onClick={onReport}
          >
            <Flag size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
function Chat({
  match,
  me,
  revision,
  onBack,
  onError,
  onPlan,
  onReport,
}: {
  match: Match;
  me: Me;
  revision: number;
  onBack: () => void;
  onError: (s: string) => void;
  onPlan: () => void;
  onReport: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false);
  const request = useRef<{ text: string; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase!
      .from("messages")
      .select("*")
      .eq("match_id", match.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) onError(error.message);
    else {
      setMessages((data || []).reverse());
      setMore((data || []).length === 100);
    }
  }, [match.id]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [messages.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    if (!navigator.onLine) {
      onError("Reconnect to send. Your message has not been sent.");
      return;
    }
    setBusy(true);
    try {
      if (!request.current || request.current.text !== text)
        request.current = { text, id: crypto.randomUUID() };
      await rpc("send_message", {
        conversation_id: match.id,
        content: text,
        request_id: request.current.id,
      });
      setText("");
      request.current = null;
      await load();
    } catch (e) {
      onError(fail(e));
    } finally {
      setBusy(false);
    }
  }
  const starter = `You mentioned ${match.profile.interests[0] || "trying new things"} — what’s a favourite local spot for that?`;
  return (
    <section className="chat">
      <div className="chat-head">
        <button
          className="icon-button"
          onClick={onBack}
          aria-label="Back to matches"
        >
          <ChevronLeft />
        </button>
        <PhotoView
          photo={match.profile.photos[0]}
          alt={match.profile.display_name}
        />
        <div>
          <h2>{match.profile.display_name}</h2>
          <span>Mutual connection · Private conversation</span>
        </div>
        <button className="secondary" onClick={onPlan}>
          <CalendarDays size={16} /> Make a plan
        </button>
        <button
          className="icon-button"
          onClick={onReport}
          aria-label="Report or block"
        >
          <Flag size={18} />
        </button>
      </div>
      <div className="conversation">
        <div className="conversation-start">
          <ShieldCheck size={17} />
          <p>
            You both chose to connect. Keep it kind, and share personal details
            at your own pace.
          </p>
        </div>
        {more && (
          <button
            className="text-button"
            onClick={async () => {
              const { data, error } = await supabase!
                .from("messages")
                .select("*")
                .eq("match_id", match.id)
                .lt("created_at", messages[0].created_at)
                .order("created_at", { ascending: false })
                .limit(100);
              if (error) onError(error.message);
              else {
                setMessages((v) => [...(data || []).reverse(), ...v]);
                setMore((data || []).length === 100);
              }
            }}
          >
            Load earlier messages
          </button>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message ${m.sender === me.id ? "own" : ""}`}
          >
            <p>{m.body}</p>
            <time dateTime={m.created_at}>{dateLabel(m.created_at)}</time>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="introduction">
            <span className="eyebrow">A PROPER INTRODUCTION</span>
            <h3>Start with something real.</h3>
            <p>{starter}</p>
            <button className="text-button" onClick={() => setText(starter)}>
              Use this introduction <ArrowUpRight size={15} />
            </button>
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form className="composer" onSubmit={send}>
        <label className="sr-only" htmlFor="message">
          Your message
        </label>
        <textarea
          id="message"
          placeholder="A thoughtful hello…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          required
          rows={2}
        />
        <button
          className="primary"
          disabled={busy || !text.trim()}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>
      <span className="micro-label">
        Messages are private to active match participants. They are not
        end-to-end encrypted.
      </span>
    </section>
  );
}
function Plans({
  plans,
  matches,
  me,
  onRefresh,
  onError,
  onNotice,
}: {
  plans: Plan[];
  matches: Match[];
  me: Me;
  onRefresh: () => void;
  onError: (s: string) => void;
  onNotice: (s: string) => void;
}) {
  const [editing, setEditing] = useState<Plan | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  async function change(p: Plan, action: string) {
    setBusy(true);
    try {
      await rpc("change_date", {
        plan_id: p.id,
        expected_version: p.version,
        action,
      });
      onRefresh();
      onNotice(
        action === "accept"
          ? "It’s a date. Plan accepted."
          : "Date cancelled. Your match can see the update.",
      );
    } catch (e) {
      onError(fail(e));
    } finally {
      setBusy(false);
    }
  }
  async function share(p: Plan) {
    const text = `My Mjolo date check-in: ${p.venue}, ${p.area}, ${dateLabel(p.scheduled_at)} SAST. Please check in with me afterwards. This is a plan I chose to share, not emergency monitoring.`;
    try {
      if (navigator.share)
        await navigator.share({ title: "My date plan", text });
      else {
        await navigator.clipboard.writeText(text);
        onNotice("Date plan copied. Share it with someone you trust.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") onError(fail(e));
    }
  }
  function calendar(p: Plan) {
    const clean = (v: string) =>
      v
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/[,;]/g, "\\$&")
        .replace(/\r/g, "");
    const stamp = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Mjolo//Date plans//EN",
      "BEGIN:VEVENT",
      `UID:${p.id}@mjolo`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(new Date(p.scheduled_at))}`,
      `DTEND:${stamp(new Date(Date.parse(p.scheduled_at) + 3600000))}`,
      `SUMMARY:${clean("Date at " + p.venue)}`,
      `LOCATION:${clean(p.venue + ", " + p.area)}`,
      `DESCRIPTION:${clean("Meet in public. Arrange your own transport. " + p.note)}`,
      ...(me.reminders
        ? [
            "BEGIN:VALARM",
            "TRIGGER:-PT1H",
            "ACTION:DISPLAY",
            "DESCRIPTION:Your date plan. Consider sharing a check-in with someone you trust.",
            "END:VALARM",
          ]
        : []),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    downloadFile(content, "text/calendar", `mjolo-date-${p.id}.ics`);
    onNotice(
      "Calendar file downloaded. Import it into your calendar to enable the reminder. Amended plans need to be re-imported.",
    );
  }
  return (
    <section>
      <div className="plans-intro">
        <div>
          <span className="eyebrow">DATE WITHIN REACH</span>
          <h2>Good company. A considered plan.</h2>
          <p>
            Choose a public spot, a shared budget, and a time that works for
            both of you. Times shown in South African Standard Time.
          </p>
        </div>
        <button
          className="primary"
          disabled={!matches.length}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={18} /> Propose a date
        </button>
      </div>
      {!matches.length && (
        <p className="muted">
          Date planning becomes available after a mutual match.
        </p>
      )}
      <div className="plan-grid">
        {plans.map((p) => {
          const match = matches.find((m) => m.id === p.match_id);
          return (
            <article className="plan-card" key={p.id}>
              <div className="plan-top">
                <CalendarDays />
                <span className={`status ${p.status}`}>{p.status}</span>
              </div>
              <span className="eyebrow">
                WITH {match?.profile.display_name || "YOUR MATCH"}
              </span>
              <h2>{p.venue}</h2>
              <p>
                <MapPin size={15} />
                {p.area}
              </p>
              <p>{dateLabel(p.scheduled_at)} SAST</p>
              <p className="plan-budget">
                {money(p.budget_zar)}{" "}
                <span>agreed total budget · confirm how you’ll split it</span>
              </p>
              {p.note && <p>{p.note}</p>}
              <div className="plan-actions">
                {p.status === "proposed" && p.proposer !== me.id && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void change(p, "accept")}
                  >
                    <Check size={16} /> Accept
                  </button>
                )}
                {p.status !== "cancelled" && (
                  <>
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      Amend
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Cancel this date for both of you?"))
                          void change(p, "cancel");
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              {p.status === "accepted" && (
                <div className="check-in">
                  <ShieldCheck size={18} />
                  <p>
                    Optional date check-in. Share this plan with someone you
                    trust. Mjolo does not monitor your date or provide emergency
                    response.
                  </p>
                  <button className="text-button" onClick={() => void share(p)}>
                    Share my plan <ArrowUpRight size={14} />
                  </button>
                  <button className="text-button" onClick={() => calendar(p)}>
                    Add to calendar <Download size={14} />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!plans.length && (
        <Empty
          icon={<CalendarDays />}
          title="Something to look forward to."
          text="Your date proposals and accepted plans will appear here."
        />
      )}
      {open && (
        <Dialog
          title={
            editing ? "Make a thoughtful amendment" : "A date within reach"
          }
          onClose={() => setOpen(false)}
        >
          <p>
            Choose a public venue and broad area. Please never enter a home
            address. Amendments need the other person’s acceptance again.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              const input = {
                venue: f.get("venue"),
                area: f.get("area"),
                scheduled_at: new Date(
                  String(f.get("scheduled_at")) + "+02:00",
                ).toISOString(),
                budget_zar: Number(f.get("budget_zar")),
                note: f.get("note"),
              };
              try {
                if (editing)
                  await rpc("change_date", {
                    plan_id: editing.id,
                    expected_version: editing.version,
                    action: "update",
                    input,
                  });
                else
                  await rpc("propose_date", {
                    conversation_id: f.get("match"),
                    input,
                  });
                setOpen(false);
                onRefresh();
                onNotice(
                  "Proposal saved. Your match can accept or suggest a change.",
                );
              } catch (e) {
                onError(fail(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {!editing && (
              <Field label="Your connection">
                <select name="match" required>
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.profile.display_name} · {money(m.profile.budget_min)}–
                      {money(m.profile.budget_max)} · {m.profile.availability}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Public venue">
              <input
                name="venue"
                required
                minLength={3}
                maxLength={200}
                defaultValue={editing?.venue}
                placeholder="e.g. A café at the waterfront"
              />
            </Field>
            <Field label="Broad public area">
              <input
                name="area"
                required
                minLength={2}
                maxLength={100}
                defaultValue={editing?.area}
                placeholder="e.g. V&A Waterfront, Cape Town"
              />
            </Field>
            <Field label="Date and time · SAST (UTC+2)">
              <input
                name="scheduled_at"
                type="datetime-local"
                required
                defaultValue={
                  editing
                    ? new Date(Date.parse(editing.scheduled_at) + 7200000)
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
              />
            </Field>
            <Field label="Total budget in rand (ZAR)">
              <input
                name="budget_zar"
                type="number"
                required
                min="0"
                max="100000"
                defaultValue={editing?.budget_zar || 200}
              />
            </Field>
            <Field label="A note for your match">
              <textarea
                name="note"
                maxLength={1000}
                defaultValue={editing?.note}
                placeholder="Coffee, a slow walk, and no rush."
              />
            </Field>
            <button className="primary full" disabled={busy}>
              Send {editing ? "amendment" : "proposal"}{" "}
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
function downloadFile(content: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ProfileEditor({
  me,
  onSaved,
  onError,
  onNotice,
  onSignout,
}: {
  me: Me;
  onSaved: (m: Me) => void;
  onError: (s: string) => void;
  onNotice: (s: string) => void;
  onSignout: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [blocks, setBlocks] = useState<{ target: string }[]>([]),
    [passwordOpen, setPasswordOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    supabase!
      .from("blocks")
      .select("target")
      .then(({ data, error }) => {
        if (error) onError(error.message);
        else setBlocks(data || []);
      });
  }, [me]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget),
      input: Record<string, unknown> = {};
    for (const [k, v] of f.entries()) input[k] = String(v).trim();
    for (const k of [
      "min_age",
      "max_age",
      "budget_min",
      "budget_max",
      "quiet_start",
      "quiet_end",
    ])
      input[k] = Number(input[k]);
    for (const k of ["paused", "show_area", "low_data", "reminders"])
      input[k] = f.get(k) === "on";
    for (const k of ["interests", "languages"])
      input[k] = String(input[k] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    try {
      onSaved(await rpc<Me>("save_profile", { input }));
    } catch (e) {
      onError(fail(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await account("upload", await compressPhoto(file, me.low_data));
      onSaved(await rpc<Me>("get_me"));
      onNotice("Photo uploaded privately and stripped of location metadata.");
    } catch (e) {
      onError(fail(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="you-layout">
      <section>
        <form className="profile-form" onSubmit={save}>
          <div className="form-section-title">
            <span>01</span>
            <div>
              <h2>The essentials.</h2>
              <p>Contact details and your birth date stay private.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Display name">
              <input
                name="display_name"
                defaultValue={me.display_name}
                minLength={2}
                maxLength={60}
                required
              />
            </Field>
            <Field label="Birth date · private, fixed once set">
              <input
                name="dob"
                type="date"
                defaultValue={me.dob || ""}
                readOnly={!!me.dob}
                required
              />
            </Field>
            <Field label="Gender">
              <select name="gender" defaultValue={me.gender} required>
                <option value="" disabled>
                  Select
                </option>
                <option value="woman">Woman</option>
                <option value="man">Man</option>
                <option value="nonbinary">Nonbinary</option>
              </select>
            </Field>
            <Field label="Open to meeting">
              <select name="seeking" defaultValue={me.seeking}>
                <option value="everyone">Everyone</option>
                <option value="woman">Women</option>
                <option value="man">Men</option>
                <option value="nonbinary">Nonbinary people</option>
              </select>
            </Field>
            <Field label="Province">
              <select name="province" defaultValue={me.province} required>
                <option value="" disabled>
                  Select province
                </option>
                {provinces.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <input
                name="city"
                defaultValue={me.city}
                minLength={2}
                maxLength={80}
                required
              />
            </Field>
            <Field label="Broad area · no home addresses">
              <input name="area" defaultValue={me.area} maxLength={100} />
            </Field>
            <Field label="Languages · comma separated">
              <input
                name="languages"
                defaultValue={me.languages.join(", ")}
                maxLength={400}
                required
              />
            </Field>
          </div>
          <Field label="Your introduction · 20–1000 characters">
            <textarea
              name="bio"
              defaultValue={me.bio}
              minLength={20}
              maxLength={1000}
              rows={4}
              required
              placeholder="The little things, the big dreams, the Sunday rituals…"
            />
          </Field>
          <Field label="Interests · up to 12, comma separated">
            <input
              name="interests"
              defaultValue={me.interests.join(", ")}
              maxLength={400}
              placeholder="Live music, hiking, good coffee"
            />
          </Field>
          <div className="form-section-title">
            <span>02</span>
            <div>
              <h2>On the same page.</h2>
              <p>Shared intentions make better beginnings.</p>
            </div>
          </div>
          <Field label="What are you looking for?">
            <select name="intentions" defaultValue={me.intentions}>
              {intentions.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Preferred minimum age">
              <input
                type="number"
                name="min_age"
                min="18"
                max="110"
                defaultValue={me.min_age}
                required
              />
            </Field>
            <Field label="Preferred maximum age">
              <input
                type="number"
                name="max_age"
                min="18"
                max="110"
                defaultValue={me.max_age}
                required
              />
            </Field>
            <Field label="Date budget from (ZAR)">
              <input
                type="number"
                name="budget_min"
                min="0"
                max="100000"
                defaultValue={me.budget_min}
                required
              />
            </Field>
            <Field label="Date budget to (ZAR)">
              <input
                type="number"
                name="budget_max"
                min="0"
                max="100000"
                defaultValue={me.budget_max}
                required
              />
            </Field>
            <Field label="Usually free">
              <select name="availability" defaultValue={me.availability}>
                <option>Weekends</option>
                <option>Weekday evenings</option>
                <option>Flexible</option>
              </select>
            </Field>
          </div>
          <div className="form-section-title">
            <span>03</span>
            <div>
              <h2>Your pace. Your privacy.</h2>
              <p>Change these whenever life needs a little space.</p>
            </div>
          </div>
          <label className="switch-row">
            <input type="checkbox" name="paused" defaultChecked={me.paused} />
            <span>
              <strong>Pause discovery</strong>
              <small>
                Hide from new people. Existing matches remain available.
              </small>
            </span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              name="show_area"
              defaultChecked={me.show_area}
            />
            <span>
              <strong>Show my city and broad area</strong>
              <small>
                Your province remains visible. No GPS or precise location.
              </small>
            </span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              name="low_data"
              defaultChecked={me.low_data}
            />
            <span>
              <strong>Low-data photo uploads</strong>
              <small>Smaller, compressed images. No autoplay, ever.</small>
            </span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              name="reminders"
              defaultChecked={me.reminders}
            />
            <span>
              <strong>Calendar reminders</strong>
              <small>
                Add a one-hour reminder to date calendar downloads. Import the
                file to activate it.
              </small>
            </span>
          </label>
          <div className="form-grid">
            <Field label="Quiet hours begin · SAST">
              <input
                name="quiet_start"
                type="number"
                min="0"
                max="23"
                defaultValue={me.quiet_start}
                required
              />
            </Field>
            <Field label="Quiet hours end · SAST">
              <input
                name="quiet_end"
                type="number"
                min="0"
                max="23"
                defaultValue={me.quiet_end}
                required
              />
            </Field>
          </div>
          <p className="muted">
            Quiet hours are saved for future notification delivery. Mjolo
            currently sends no push notifications.
          </p>
          <button className="primary" disabled={busy}>
            Save my profile <Check size={17} />
          </button>
        </form>
      </section>
      <aside className="profile-sidebar">
        <div className="photo-manager">
          <span className="eyebrow">LET THEM SEE YOU</span>
          <h2>Your best introduction.</h2>
          <p>Up to six photos. No public photo bucket, no location metadata.</p>
          <div className="photo-strip">
            {me.photos.map((p) => (
              <div className="managed-photo" key={p.id}>
                <PhotoView photo={p} alt="Your profile photo" />
                <button
                  className="icon-button"
                  aria-label="Delete photo"
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm("Delete this photo?")) return;
                    setBusy(true);
                    try {
                      await account("delete-photo", { id: p.id });
                      onSaved(await rpc<Me>("get_me"));
                    } catch (e) {
                      onError(fail(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="upload-button"
            disabled={busy || me.photos.length >= 6}
            onClick={() => fileInput.current?.click()}
          >
            <Camera size={19} />
            {busy ? "Working…" : "Add a photo"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png"
            disabled={busy || me.photos.length >= 6}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <small>JPEG or PNG · up to 6 MB before compression</small>
        </div>
        <div className="account-controls">
          <h3>Your account</h3>
          <p>@{me.username} · Email confirmed</p>
          <button className="text-button" onClick={() => setPasswordOpen(true)}>
            <LockKeyhole size={16} /> Change password
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const data = await account("export");
                downloadFile(
                  JSON.stringify(data, null, 2),
                  "application/json",
                  "mjolo-my-data.json",
                );
                onNotice(
                  "Account data downloaded. Store it securely; it contains your personal information.",
                );
              } catch (e) {
                onError(fail(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={16} /> Export my data
          </button>
          <button className="text-button" onClick={onSignout}>
            <LogOut size={16} /> Sign out
          </button>
          <button
            className="text-button danger"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            Permanently delete account
          </button>
        </div>
        {blocks.length > 0 && (
          <div className="account-controls">
            <h3>Blocked accounts</h3>
            {blocks.map((b) => (
              <div key={b.target}>
                <span className="muted">
                  Blocked account {b.target.slice(0, 6)}
                </span>
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await rpc("unblock_user", { target_id: b.target });
                      setBlocks((v) => v.filter((x) => x.target !== b.target));
                      onNotice(
                        "Unblocked. Previous matches and conversations are not restored.",
                      );
                    } catch (e) {
                      onError(fail(e));
                    }
                  }}
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>
      {me.role === "admin" && <Admin onError={onError} onNotice={onNotice} />}{" "}
      {deleteOpen && (
        <Dialog
          title="Permanently delete your account?"
          onClose={() => setDeleteOpen(false)}
        >
          <p>
            This removes your account, photos, matches, messages and date plans
            from active systems. It cannot be undone. Provider backups expire
            according to the operator's published retention policy.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const password = String(
                new FormData(e.currentTarget).get("password"),
              );
              setBusy(true);
              try {
                await account("delete", { password });
                await supabase!.auth.signOut({ scope: "local" });
                onNotice("Your account has been deleted.");
              } catch (e) {
                onError(fail(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Confirm your password">
              <input
                name="password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </Field>
            <button className="primary full" disabled={busy}>
              Delete my account permanently
            </button>
          </form>
        </Dialog>
      )}
      {passwordOpen && (
        <Dialog
          title="Change your password"
          onClose={() => setPasswordOpen(false)}
        >
          <p>
            For security, sign in again first if your provider requests recent
            authentication.
          </p>
          <PasswordChange
            initial={false}
            onDone={() => {
              setPasswordOpen(false);
              onNotice("Password updated.");
            }}
            onError={onError}
          />
        </Dialog>
      )}
    </div>
  );
}
function SafetyDialog({
  p,
  onClose,
  onError,
  onDone,
}: {
  p: Profile;
  onClose: () => void;
  onError: (s: string) => void;
  onDone: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Your comfort comes first." onClose={onClose}>
      <p>
        Report {p.display_name} for moderator review, or block them to end your
        connection and prevent further interaction. Blocking removes your shared
        conversation.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await rpc("report_user", {
              target_id: p.id,
              reason_text: f.get("reason"),
              detail_text: f.get("details"),
            });
            onDone("Report received. A moderator can review it.");
          } catch (e) {
            onError(fail(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Reason">
          <select name="reason">
            <option value="harassment">Harassment</option>
            <option value="underage">May be under 18</option>
            <option value="impersonation">Impersonation</option>
            <option value="scam">Scam or fraud</option>
            <option value="unsafe">Unsafe behaviour</option>
            <option value="other">Something else</option>
          </select>
        </Field>
        <Field label="What happened? · 10–2000 characters">
          <textarea
            name="details"
            minLength={10}
            maxLength={2000}
            required
            rows={4}
          />
        </Field>
        <button className="primary" disabled={busy}>
          <Flag size={16} /> Send report
        </button>
      </form>
      <button
        className="secondary danger"
        disabled={busy}
        onClick={async () => {
          if (
            !confirm(
              `Block ${p.display_name}? Your match and conversation will be removed.`,
            )
          )
            return;
          setBusy(true);
          try {
            await rpc("block_user", { target_id: p.id });
            onDone(
              "Account blocked. You can no longer discover or contact each other.",
            );
          } catch (e) {
            onError(fail(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Ban size={16} /> Block this person
      </button>
      <p className="muted">
        In immediate danger, contact South African emergency services directly.
        Mjolo is not an emergency service.
      </p>
    </Dialog>
  );
}
type Report = {
  id: string;
  target: string | null;
  reason: string;
  details: string;
  status: string;
  created_at: string;
};
function Admin({
  onError,
  onNotice,
}: {
  onError: (s: string) => void;
  onNotice: (s: string) => void;
}) {
  const [reports, setReports] = useState<Report[]>([]),
    [audit, setAudit] = useState<unknown[]>([]),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const { data, error } = await supabase!
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    setReports(data || []);
    setAudit(await rpc<unknown[]>("admin_audit"));
  };
  useEffect(() => {
    load().catch((e) => onError(fail(e)));
  }, []);
  return (
    <section className="admin-panel">
      <span className="eyebrow">ADMINISTRATOR · SERVER AUTHORISED</span>
      <h2>Care for the community.</h2>
      <p>
        Review reports, resolve cases, and suspend or restore reported accounts.
        Every moderation action is recorded.
      </p>
      <button
        className="secondary"
        onClick={() => void load().catch((e) => onError(fail(e)))}
      >
        Refresh queue
      </button>
      {!reports.length && <p>No reports in the queue.</p>}
      {reports.map((r) => (
        <article className="report-card" key={r.id}>
          <span className="status">{r.status}</span>
          <h3>{r.reason}</h3>
          <p>{r.details}</p>
          <small>
            {dateLabel(r.created_at)} · Target {r.target || "deleted account"}
          </small>
          <div className="plan-actions">
            {[
              ["Resolve", null],
              ["Suspend", "suspended"],
              ["Restore", "active"],
            ].map(([label, status]) => (
              <button
                className="secondary"
                key={label}
                disabled={busy || (!r.target && status !== null)}
                onClick={async () => {
                  if (status && !confirm(`${label} this account?`)) return;
                  setBusy(true);
                  try {
                    await rpc("moderate", {
                      report_id: r.id,
                      new_status: "resolved",
                      user_status: status,
                    });
                    await load();
                    onNotice("Moderation action recorded.");
                  } catch (e) {
                    onError(fail(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </article>
      ))}
      <details>
        <summary>Audit trail · latest {audit.length} events</summary>
        <pre>{JSON.stringify(audit, null, 2)}</pre>
      </details>
    </section>
  );
}

class AppBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Application view failed:", error.name);
  }
  render() {
    return this.state.failed ? (
      <main>
        <section className="narrow" role="alert">
          <Logo />
          <h1>Let’s reconnect.</h1>
          <p>
            This view could not open. Your saved account data is safe. Reload to
            try again.
          </p>
          <button className="primary" onClick={() => location.reload()}>
            Reload app
          </button>
        </section>
      </main>
    ) : (
      this.props.children
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);
