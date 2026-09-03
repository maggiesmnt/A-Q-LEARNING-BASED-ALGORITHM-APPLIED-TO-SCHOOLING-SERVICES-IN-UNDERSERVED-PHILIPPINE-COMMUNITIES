"""
train_q_learning.py
=============================================================================
Enhanced Double Q-Learning training script for:
"A Q-Learning Based Algorithm Applied to Schooling Services in
Underserved Philippine Communities" -- Chapter 3, Section 3.2.1
(Algorithm Procedure) and Section 3.2.2 (System Architecture).

WHAT THIS SCRIPT IS FOR
-------------------------------------------------------------------------
The GitHub prototype (engine.js) only replays a fixed greedy scoring
formula on hardcoded node data -- it never actually trains a policy,
which is why nothing in that repo "updates." This script is the piece
that was missing: it actually runs the training loop from Section
3.2.1 -- Q1/Q2 tables, epsilon-greedy exploration, the multi-objective
reward function, and the decoupled Double Q-learning update rule --
across many episodes, and logs what a real Chapter 4 training run
would produce.

DATA NOTE
-------------------------------------------------------------------------
DepEd enrollment/registry data and the real OSM road network have been
requested but not yet released. Until that data arrives, this script
trains on the SAME placeholder node/edge data already used in the
prototype's engine.js (the Laiban / Tanay / Rizal sitios), so the
numbers produced here are illustrative, not final results. When the
real data comes in, only the NODES / EDGES / weather-report tables at
the top of this file need to be swapped -- the state design, reward
function, and training loop underneath do not change.

STATE / ACTION / REWARD DESIGN (documented for the defense)
-------------------------------------------------------------------------
The paper defines the state as S = <L, D, T, H, A> (location, demand,
time budget, visit history, accessibility). For TABULAR Q-learning,
a continuous S must be discretized into a finite table, so this script
encodes state as:

    state = (current_node, visited_mask, time_bucket)

  - L (location)        -> current_node: which sitio the unit is at
  - H (visit history)    -> visited_mask: bitmask of which sitios have
                             already been served THIS shift (this also
                             stands in for D, since a node still masked
                             "unvisited" is still in demand)
  - T (time budget)      -> time_bucket: remaining shift minutes,
                             discretized into 6 bins
  - A (accessibility)    -> NOT stored in the state directly. Instead,
                             exactly like engine.js's neighbors()/path(),
                             a road with A < 0.20 is masked out of the
                             action set for that step. This keeps A as
                             a hard, algorithm-agnostic safety constraint
                             rather than a table dimension, matching how
                             the existing prototype already treats it.

This is a defensible simplification, not a deviation from the theory:
full continuous-state MDPs are normally paired with function
approximation (e.g. a neural network) rather than a lookup table; a
tabular implementation of a continuous-state MDP always requires this
kind of discretization. Flag this explicitly if asked in the defense.

Each episode samples a fresh weather scenario (rainfall mm) and, with
some probability, a random hazard report that closes or degrades a
road -- this is what makes Q-learning worth using in the first place:
a fixed shortest-path table computed once cannot adapt to a road that
is only sometimes usable, but a policy trained across many randomized
weather/hazard days can learn to route around that uncertainty.
=============================================================================
"""

import json
import math
import os
import random
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

random.seed(42)
np.random.seed(42)

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
os.makedirs(OUT_DIR, exist_ok=True)

# =============================================================================
# 1. ENVIRONMENT -- ported directly from engine.js (same placeholder data)
# =============================================================================

NODES = {
    "hub": dict(name="Laiban ALS Hub",       kind="depot", lat=14.5762, lng=121.3828, learners=0,  visits30=0),
    "mah": dict(name="Sitio Mahabang Lalim",  kind="node",  lat=14.5921, lng=121.4026, learners=48, visits30=2),
    "kab": dict(name="Sitio Kabayunan",       kind="node",  lat=14.5606, lng=121.4131, learners=63, visits30=1),
    "dar": dict(name="Daraitan Proper",       kind="node",  lat=14.6108, lng=121.4315, learners=87, visits30=3),
    "tin": dict(name="Sitio Tinipak",         kind="node",  lat=14.6204, lng=121.4402, learners=41, visits30=0),
    "inz": dict(name="Sta. Inez",             kind="node",  lat=14.5512, lng=121.3562, learners=72, visits30=2),
    "cay": dict(name="Cayabu",                kind="node",  lat=14.5292, lng=121.3396, learners=56, visits30=2),
    "pun": dict(name="Sitio Pungo",           kind="node",  lat=14.5446, lng=121.4288, learners=34, visits30=0),
    "amp": dict(name="Sitio Mag-Ampon",       kind="node",  lat=14.6018, lng=121.3548, learners=29, visits30=1),
}
SERVICE_NODES = [nid for nid, n in NODES.items() if n["kind"] == "node"]  # excludes hub
MAX_LEARNERS = max(NODES[n]["learners"] for n in SERVICE_NODES)

SURF_A = {"concrete": 1.00, "gravel": 0.85, "dirt": 0.65, "ford": 0.50}
SURF_SPEED = {"concrete": 38, "gravel": 24, "dirt": 16, "ford": 12}

EDGES = [
    ("hub", "inz", "concrete"),
    ("inz", "cay", "concrete"),
    ("hub", "amp", "gravel"),
    ("hub", "mah", "gravel"),
    ("amp", "dar", "dirt"),
    ("mah", "dar", "gravel"),
    ("dar", "tin", "ford"),
    ("mah", "kab", "dirt"),
    ("kab", "pun", "dirt"),
    ("inz", "kab", "dirt"),
    ("cay", "pun", "dirt"),
]

SHIFT_MIN = 480          # 8-hour shift, same as CLOCK/SHIFT_MIN in engine.js
TIME_BUCKETS = 6         # discretization of remaining time budget for state T


def haversine_km(a, b):
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, [NODES[a]["lat"], NODES[a]["lng"], NODES[b]["lat"], NODES[b]["lng"]])
    dla, dlo = la2 - la1, lo2 - lo1
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


EDGE_KM = {}
EDGE_SURF = {}
ADJ = defaultdict(list)
for a, b, surf in EDGES:
    key = tuple(sorted((a, b)))
    km = haversine_km(a, b)
    EDGE_KM[key] = km
    EDGE_SURF[key] = surf
    ADJ[a].append(b)
    ADJ[b].append(a)


def service_min(node_id):
    return 25 + round(NODES[node_id]["learners"] / 3)


def jain_index(values):
    values = list(values)
    s = sum(values)
    q = sum(v * v for v in values)
    if q == 0:
        return 1.0
    return (s * s) / (len(values) * q)


class WeatherDay:
    """One episode's environmental conditions -- sampled fresh every
    episode so the agent has to generalize across varying road access,
    not memorize one fixed map. Mirrors WX/REPORTS in engine.js."""

    def __init__(self, rng):
        self.mm = rng.uniform(0, 80)
        # With some probability, a random edge gets a hazard report this
        # "day" (landslide / washout / rising water), same idea as the
        # REPORTS array in engine.js but randomized per episode.
        self.hazard_edge = None
        self.hazard_severity = None
        if rng.random() < 0.35:
            self.hazard_edge = rng.choice(list(EDGE_KM.keys()))
            self.hazard_severity = rng.choice(["impassable", "major", "minor"])

    def wx_factor(self, surf):
        band = 0 if self.mm < 10 else 1 if self.mm < 30 else 2 if self.mm < 60 else 3
        if surf == "concrete":
            return [1, 1, 0.95, 0.85][band]
        if surf == "ford":
            return [1, 0.85, 0.45, 0.15][band]
        return [1, 0.85, 0.60, 0.35][band]

    def hazard_factor(self, key):
        if self.hazard_edge != key:
            return 1.0
        return {"impassable": 0.05, "major": 0.40, "minor": 0.72}[self.hazard_severity]

    def accessibility(self, key):
        surf = EDGE_SURF[key]
        a = SURF_A[surf] * self.wx_factor(surf) * self.hazard_factor(key)
        return max(0.0, min(1.0, a))

    def edge_minutes(self, a, b):
        key = tuple(sorted((a, b)))
        acc = self.accessibility(key)
        if acc < 0.20:
            return None  # hard mask, same threshold as engine.js neighbors()
        km = EDGE_KM[key]
        speed = SURF_SPEED[EDGE_SURF[key]]
        return (km / speed) * 60 / max(acc, 0.08)


def dijkstra(weather, start, goal):
    """Shortest-time path under this episode's hazard-masked graph.
    Same masking rule engine.js applies to BOTH algorithms."""
    dist = {start: 0.0}
    prev = {}
    visited = set()
    frontier = [start]
    while frontier:
        frontier.sort(key=lambda n: dist.get(n, math.inf))
        cur = frontier.pop(0)
        if cur in visited:
            continue
        visited.add(cur)
        if cur == goal:
            break
        for nb in ADJ[cur]:
            mins = weather.edge_minutes(cur, nb)
            if mins is None:
                continue
            nd = dist[cur] + mins
            if nd < dist.get(nb, math.inf):
                dist[nb] = nd
                prev[nb] = cur
                frontier.append(nb)
    if goal not in dist:
        return None
    return dist[goal]


# =============================================================================
# 2. STATE / ACTION HELPERS
# =============================================================================

NODE_IDX = {nid: i for i, nid in enumerate(SERVICE_NODES)}  # bit position per node
N_NODES = len(SERVICE_NODES)


def time_bucket(remaining):
    frac = max(0.0, min(1.0, remaining / SHIFT_MIN))
    b = int(frac * TIME_BUCKETS)
    return min(b, TIME_BUCKETS - 1)


def encode_state(cur, mask, remaining):
    return (cur, mask, time_bucket(remaining))


def reachable_actions(weather, cur, mask, remaining, visits):
    """Valid next stops: not yet visited this shift, and reachable
    within the remaining time budget under this episode's hazards."""
    actions = []
    for nid in SERVICE_NODES:
        bit = 1 << NODE_IDX[nid]
        if mask & bit:
            continue
        d = dijkstra(weather, cur, nid)
        if d is None:
            continue
        need = d + service_min(nid)
        if need <= remaining:
            actions.append((nid, d))
    return actions


# =============================================================================
# 3. REWARD -- multi-objective for the proposed algorithm (Section 3.2.1),
#    single-objective (travel time only) for the "existing" baseline.
# =============================================================================

def proposed_reward(target, travel_min, visits, mask):
    coverage = NODES[target]["learners"] / MAX_LEARNERS
    trial = dict(visits)
    trial[target] = trial.get(target, 0) + 1
    fairness = jain_index(trial.values())
    travel_hours = max(travel_min / 60, 1e-6)
    return coverage * fairness * (1 / travel_hours), fairness


def baseline_reward(travel_min):
    travel_hours = max(travel_min / 60, 1e-6)
    return 1 / travel_hours  # single objective: efficiency only, no coverage/fairness term


# =============================================================================
# 4. DOUBLE Q-LEARNING TRAINING LOOP  (Section 3.2.1 -- Algorithm Procedure)
# =============================================================================

ALPHA = 0.10
GAMMA = 0.90
EPS_START = 1.0
EPS_MIN = 0.05
EPS_DECAY = 0.995
N_EPISODES = 1200  # within the paper's stated 500-2,000 range


def epsilon_greedy(q_combo, state, actions, eps, rng):
    if rng.random() < eps or state not in q_combo:
        return rng.choice(actions)
    values = {a: q_combo[state].get(a, 0.0) for a in actions}
    best = max(values, key=values.get)
    return best


def q_get(table, state, action):
    return table.get(state, {}).get(action, 0.0)


def q_set(table, state, action, value):
    table.setdefault(state, {})[action] = value


def train_double_q():
    """Full implementation of the pseudocode on pages 51-52: two
    independent tables Q1/Q2, epsilon-greedy behavior policy on the
    combined value, and a randomly-chosen decoupled update each step."""
    Q1, Q2 = {}, {}
    rng = random.Random(7)
    eps = EPS_START
    log = []

    for ep in range(N_EPISODES):
        weather = WeatherDay(rng)
        cur, mask, remaining = "hub", 0, SHIFT_MIN
        visits = {nid: NODES[nid]["visits30"] for nid in SERVICE_NODES}
        ep_reward = 0.0
        drift_sum, drift_n = 0.0, 0

        while True:
            actions = reachable_actions(weather, cur, mask, remaining, visits)
            if not actions:
                break  # terminal: no reachable, unvisited node left in budget

            state = encode_state(cur, mask, remaining)
            action_ids = [a[0] for a in actions]
            travel_of = {a: t for a, t in actions}

            q_combo = defaultdict(dict)
            for a in action_ids:
                q_combo[state][a] = q_get(Q1, state, a) + q_get(Q2, state, a)

            action = epsilon_greedy(q_combo, state, action_ids, eps, rng)
            travel_min = travel_of[action]
            reward, _ = proposed_reward(action, travel_min, visits, mask)
            ep_reward += reward

            next_mask = mask | (1 << NODE_IDX[action])
            next_remaining = remaining - (travel_min + service_min(action))
            next_state = encode_state(action, next_mask, next_remaining)
            next_actions = [a for a, _ in reachable_actions(weather, action, next_mask, next_remaining, visits)]

            if rng.random() < 0.5:
                if next_actions:
                    a_star = max(next_actions, key=lambda a: q_get(Q1, next_state, a))
                    target = reward + GAMMA * q_get(Q2, next_state, a_star)
                else:
                    target = reward
                old = q_get(Q1, state, action)
                q_set(Q1, state, action, old + ALPHA * (target - old))
                drift_sum += abs(q_get(Q1, state, action) - q_get(Q2, state, action))
            else:
                if next_actions:
                    a_star = max(next_actions, key=lambda a: q_get(Q2, next_state, a))
                    target = reward + GAMMA * q_get(Q1, next_state, a_star)
                else:
                    target = reward
                old = q_get(Q2, state, action)
                q_set(Q2, state, action, old + ALPHA * (target - old))
                drift_sum += abs(q_get(Q1, state, action) - q_get(Q2, state, action))
            drift_n += 1

            visits[action] = visits.get(action, 0) + 1
            cur, mask, remaining = action, next_mask, next_remaining

        eps = max(EPS_MIN, eps * EPS_DECAY)
        log.append(dict(episode=ep, reward=ep_reward, epsilon=eps,
                         q_drift=(drift_sum / drift_n if drift_n else 0.0),
                         fairness=jain_index(visits.values())))

    return Q1, Q2, pd.DataFrame(log)


def train_standard_q():
    """Single-table baseline ('Existing Algorithm'): classic Q-learning,
    travel-time-only reward, no fairness/coverage term -- mirrors
    planRouteStandard() in engine.js but actually trained over episodes."""
    Q = {}
    rng = random.Random(7)
    eps = EPS_START
    log = []
    prev_snapshot = {}

    for ep in range(N_EPISODES):
        weather = WeatherDay(rng)
        cur, mask, remaining = "hub", 0, SHIFT_MIN
        visits = {nid: NODES[nid]["visits30"] for nid in SERVICE_NODES}
        ep_reward = 0.0
        change_sum, change_n = 0.0, 0

        while True:
            actions = reachable_actions(weather, cur, mask, remaining, visits)
            if not actions:
                break

            state = encode_state(cur, mask, remaining)
            action_ids = [a[0] for a in actions]
            travel_of = {a: t for a, t in actions}
            action = epsilon_greedy(defaultdict(dict, {state: {a: q_get(Q, state, a) for a in action_ids}}),
                                     state, action_ids, eps, rng)
            travel_min = travel_of[action]
            reward = baseline_reward(travel_min)
            ep_reward += reward

            next_mask = mask | (1 << NODE_IDX[action])
            next_remaining = remaining - (travel_min + service_min(action))
            next_state = encode_state(action, next_mask, next_remaining)
            next_actions = [a for a, _ in reachable_actions(weather, action, next_mask, next_remaining, visits)]

            best_next = max((q_get(Q, next_state, a) for a in next_actions), default=0.0)
            old = q_get(Q, state, action)
            new = old + ALPHA * (reward + GAMMA * best_next - old)
            q_set(Q, state, action, new)
            change_sum += abs(new - prev_snapshot.get((state, action), 0.0))
            prev_snapshot[(state, action)] = new
            change_n += 1

            visits[action] = visits.get(action, 0) + 1
            cur, mask, remaining = action, next_mask, next_remaining

        eps = max(EPS_MIN, eps * EPS_DECAY)
        log.append(dict(episode=ep, reward=ep_reward, epsilon=eps,
                         q_drift=(change_sum / change_n if change_n else 0.0),
                         fairness=jain_index(visits.values())))

    return Q, pd.DataFrame(log)


# =============================================================================
# 5. GREEDY ROLLOUT WITH THE TRAINED POLICY (for the comparison metrics)
# =============================================================================

def rollout(policy_fn, n_days=50, seed=123):
    rng = random.Random(seed)
    totals = []
    for _ in range(n_days):
        weather = WeatherDay(rng)
        cur, mask, remaining = "hub", 0, SHIFT_MIN
        visits = {nid: NODES[nid]["visits30"] for nid in SERVICE_NODES}
        visited_this_shift, travel_total = [], 0.0
        while True:
            actions = reachable_actions(weather, cur, mask, remaining, visits)
            if not actions:
                break
            action_ids = [a[0] for a in actions]
            travel_of = {a: t for a, t in actions}
            state = encode_state(cur, mask, remaining)
            action = policy_fn(state, action_ids)
            travel_min = travel_of[action]
            travel_total += travel_min
            visited_this_shift.append(action)
            visits[action] = visits.get(action, 0) + 1
            mask |= (1 << NODE_IDX[action])
            remaining -= (travel_min + service_min(action))
            cur = action
        fairness = jain_index(visits.values())
        coverage = sum(NODES[n]["learners"] for n in visited_this_shift)
        deferred = len(SERVICE_NODES) - len(visited_this_shift)
        totals.append(dict(travel_min=travel_total, fairness=fairness,
                            coverage=coverage, deferred=deferred,
                            stops=len(visited_this_shift)))
    return pd.DataFrame(totals)


def make_modql_policy(Q1, Q2):
    def policy(state, actions):
        values = {a: q_get(Q1, state, a) + q_get(Q2, state, a) for a in actions}
        return max(values, key=values.get)
    return policy


def make_standard_policy(Q):
    def policy(state, actions):
        values = {a: q_get(Q, state, a) for a in actions}
        return max(values, key=values.get)
    return policy


# =============================================================================
# 6. RUN, LOG, PLOT
# =============================================================================

def moving_average(series, window=30):
    return series.rolling(window, min_periods=1).mean()


def main():
    print(f"Training Enhanced Double Q-Learning (MODQL) -- {N_EPISODES} episodes...")
    Q1, Q2, log_modql = train_double_q()
    print(f"Training Standard Q-Learning (baseline) -- {N_EPISODES} episodes...")
    Q_std, log_std = train_standard_q()

    # ---- combined training log CSV ----
    log_modql = log_modql.rename(columns={"reward": "reward_modql", "q_drift": "q_drift_modql",
                                           "epsilon": "epsilon_modql", "fairness": "fairness_modql"})
    log_std = log_std.rename(columns={"reward": "reward_standard", "q_drift": "q_drift_standard",
                                       "epsilon": "epsilon_standard", "fairness": "fairness_standard"})
    combined = log_modql.merge(log_std, on="episode")
    csv_path = os.path.join(OUT_DIR, "training_log.csv")
    combined.to_csv(csv_path, index=False)
    print(f"Wrote {csv_path}")

    # ---- convergence chart ----
    fig, axes = plt.subplots(2, 1, figsize=(9, 8), sharex=True)
    axes[0].plot(combined["episode"], moving_average(combined["reward_modql"]),
                 label="MODQL (proposed, Q1+Q2)", color="#0F6E56")
    axes[0].plot(combined["episode"], moving_average(combined["reward_standard"]),
                 label="Standard Q-learning (baseline)", color="#D85A30")
    axes[0].set_ylabel("Reward per episode\n(30-episode moving avg)")
    axes[0].set_title("Composite reward per episode -- MODQL vs Standard Q-learning")
    axes[0].legend()

    axes[1].plot(combined["episode"], moving_average(combined["q_drift_modql"]),
                 label="mean |Q1 - Q2| (MODQL)", color="#FAC775")
    axes[1].plot(combined["episode"], moving_average(combined["q_drift_standard"]),
                 label="single-table update drift (Standard)", color="#F09595")
    axes[1].set_ylabel("Value drift\n(30-episode moving avg)")
    axes[1].set_xlabel("Episode")
    axes[1].legend()

    fig.tight_layout()
    chart_path = os.path.join(OUT_DIR, "convergence_chart.png")
    fig.savefig(chart_path, dpi=150)
    print(f"Wrote {chart_path}")

    # ---- rollout comparison (greedy policy replay of the TRAINED tables) ----
    modql_days = rollout(make_modql_policy(Q1, Q2))
    std_days = rollout(make_standard_policy(Q_std))

    summary = {
        "episodes_trained": N_EPISODES,
        "hyperparameters": {"alpha": ALPHA, "gamma": GAMMA, "eps_start": EPS_START,
                             "eps_min": EPS_MIN, "eps_decay": EPS_DECAY},
        "modql": {
            "final_30ep_avg_reward": float(moving_average(combined["reward_modql"]).iloc[-1]),
            "rollout_avg_travel_min": float(modql_days["travel_min"].mean()),
            "rollout_avg_fairness": float(modql_days["fairness"].mean()),
            "rollout_avg_stops": float(modql_days["stops"].mean()),
            "rollout_avg_deferred": float(modql_days["deferred"].mean()),
        },
        "standard": {
            "final_30ep_avg_reward": float(moving_average(combined["reward_standard"]).iloc[-1]),
            "rollout_avg_travel_min": float(std_days["travel_min"].mean()),
            "rollout_avg_fairness": float(std_days["fairness"].mean()),
            "rollout_avg_stops": float(std_days["stops"].mean()),
            "rollout_avg_deferred": float(std_days["deferred"].mean()),
        },
        "data_note": ("Trained on placeholder node/edge data from engine.js "
                      "(DepEd registry and OSM road data requested, not yet received). "
                      "Re-run this script unchanged once real data is available -- "
                      "only NODES/EDGES need to be replaced."),
    }
    summary_path = os.path.join(OUT_DIR, "comparison_summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Wrote {summary_path}")

    # ---- compact trained policy export (for wiring back into charts.js) ----
    policy_export = {
        "q1": {f"{s[0]}|{s[1]}|{s[2]}": v for s, v in Q1.items()},
        "q2": {f"{s[0]}|{s[1]}|{s[2]}": v for s, v in Q2.items()},
        "node_bit_index": NODE_IDX,
        "note": "state key format = current_node|visited_mask|time_bucket",
    }
    policy_path = os.path.join(OUT_DIR, "final_policy_modql.json")
    with open(policy_path, "w") as f:
        json.dump(policy_export, f, indent=2)
    print(f"Wrote {policy_path}")

    print("\n=== Headline comparison (rollout over 50 simulated deployment days) ===")
    print(f"{'metric':<24}{'MODQL':>12}{'Standard':>12}")
    for key, label in [("rollout_avg_travel_min", "avg travel min"),
                        ("rollout_avg_fairness", "avg Jain fairness"),
                        ("rollout_avg_stops", "avg stops/day"),
                        ("rollout_avg_deferred", "avg deferred/day")]:
        print(f"{label:<24}{summary['modql'][key]:>12.3f}{summary['standard'][key]:>12.3f}")


if __name__ == "__main__":
    main()
