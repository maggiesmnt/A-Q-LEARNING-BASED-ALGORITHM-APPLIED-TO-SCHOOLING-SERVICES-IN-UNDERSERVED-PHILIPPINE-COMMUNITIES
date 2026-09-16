"""
Existing / control:
    Standard single-table Q-Learning
    S = L
    R = 1 / TravelCost
Proposed:
    Double Q-Learning
    S = <L, D, T, H, A>
    R = Coverage * JainFairness * (1 / TravelCost)
Both algorithms use:
    - the same nine Laiban sitios
    - the same simulated sitio demand allocation
    - the same initial historical-service data
    - the same 8-hour time budget
    - the same 60-minute service duration
    - the same road graph
    - the same accessibility/weather scenarios
Sitio-level D, H, and T remain controlled simulation inputs where no official
sitio-level records are available.
"""

import csv
import json
import math
import random
from pathlib import Path

# =============================================================================
# PATHS
# =============================================================================

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).with_name("outputs_aligned")
OUT.mkdir(exist_ok=True)

# =============================================================================
# FINALIZED LAIBAN ENVIRONMENT — STEPS 1–6
# =============================================================================

NODES = {
    "hub": {
        "name": "Laiban Proper / ALS Hub",
        "kind": "depot",
        "lat": 14.61785,
        "lng": 121.38961,
        "learners": 0,
        "days": 0,
        "visits30": 0,
    },
    "maysawa": {
        "name": "Sitio Maysawa",
        "kind": "node",
        "lat": 14.59780,
        "lng": 121.35114,
        "learners": 28,
        "days": 12,
        "visits30": 1,
    },
    "toyang": {
        "name": "Sitio Toyang",
        "kind": "node",
        "lat": 14.61080,
        "lng": 121.38180,
        "learners": 34,
        "days": 18,
        "visits30": 1,
    },
    "ibucao": {
        "name": "Sitio Ibucao",
        "kind": "node",
        "lat": 14.60220,
        "lng": 121.38480,
        "learners": 38,
        "days": 24,
        "visits30": 0,
    },
    "kilabuwan": {
        "name": "Sitio Kilabuwan",
        "kind": "node",
        "lat": 14.62260,
        "lng": 121.40360,
        "learners": 29,
        "days": 27,
        "visits30": 0,
    },
    "banatas": {
        "name": "Sitio Banatas",
        "kind": "node",
        "lat": 14.60940,
        "lng": 121.39940,
        "learners": 27,
        "days": 16,
        "visits30": 1,
    },
    "iwi_iw": {
        "name": "Sitio Iwi-Iw",
        "kind": "node",
        "lat": 14.62800,
        "lng": 121.39170,
        "learners": 31,
        "days": 21,
        "visits30": 0,
    },

    "old_laiban": {
        "name": "Sitio Old Laiban",
        "kind": "node",
        "lat": 14.61880,
        "lng": 121.39700,
        "learners": 30,
        "days": 9,
        "visits30": 2,
    },
    "manggahan": {
        "name": "Sitio Manggahan",
        "kind": "node",
        "lat": 14.62679,
        "lng": 121.41616,
        "learners": 35,
        "days": 30,
        "visits30": 0,
    },
    "magata": {
        "name": "Sitio Magata",
        "kind": "node",
        "lat": 14.63140,
        "lng": 121.42020,
        "learners": 32,
        "days": 26,
        "visits30": 0,
    },
}


SERVICE = [
    node_id
    for node_id, node in NODES.items()
    if node["kind"] == "node"
]

IDX = {
    node_id: index
    for index, node_id in enumerate(SERVICE)
}


# =============================================================================
# STEP 3 — BEST-SUPPORTED ROAD GRAPH
#
# bend = provisional polyline geometry currently used by browser engine.
# profile = Step 4 accessibility class.
# =============================================================================

EDGES = [
    {
        "a": "hub",
        "b": "toyang",
        "surf": "ford",
        "bend": [
            [14.6148, 121.3857],
            [14.6117, 121.3834],
        ],
        "profile": "multi_river",
    },

    {
        "a": "hub",
        "b": "ibucao",
        "surf": "ford",
        "bend": [
            [14.6128, 121.3872],
            [14.6074, 121.3858],
        ],
        "profile": "landslide_river",
    },

    {
        "a": "hub",
        "b": "maysawa",
        "surf": "dirt",
        "bend": [
            [14.6118, 121.3820],
            [14.6048, 121.3695],
        ],
        "profile": "mountain_path",
    },

    {
        "a": "hub",
        "b": "old_laiban",
        "surf": "concrete",
        "bend": [
            [14.6183, 121.3932],
        ],
        "profile": "normal_road",
    },

    {
        "a": "hub",
        "b": "banatas",
        "surf": "ford",
        "bend": [
            [14.6136, 121.3950],
        ],
        "profile": "creek_crossing",
    },

    {
        "a": "hub",
        "b": "iwi_iw",
        "surf": "gravel",
        "bend": [
            [14.6231, 121.3904],
        ],
        "profile": "unknown_qa",
    },

    {
        "a": "old_laiban",
        "b": "kilabuwan",
        "surf": "ford",
        "bend": [
            [14.6202, 121.4001],
        ],
        "profile": "multi_river",
    },

    {
        "a": "kilabuwan",
        "b": "manggahan",
        "surf": "ford",
        "bend": [
            [14.6249, 121.4095],
        ],
        "profile": "multi_river",
    },

    {
        "a": "manggahan",
        "b": "magata",
        "surf": "ford",
        "bend": [
            [14.6290, 121.4183],
        ],
        "profile": "boat_river",
    },

    {
        "a": "banatas",
        "b": "old_laiban",
        "surf": "gravel",
        "bend": [
            [14.6147, 121.3982],
        ],
        "profile": "unknown_qa",
    },
]


SURF_A = {
    "concrete": 1.00,
    "gravel": 0.85,
    "dirt": 0.65,
    "ford": 0.50,
}

SPEED = {
    "concrete": 38,
    "gravel": 24,
    "dirt": 16,
    "ford": 12,
}


# =============================================================================
# STEP 6 — OPERATIONAL CONSTRAINTS
# =============================================================================

SHIFT_MIN = 480
SERVICE_MIN_PER_STOP = 60

TIME_BUCKETS = 6


# =============================================================================
# TRAINING HYPERPARAMETERS
# =============================================================================

ALPHA = 0.10
GAMMA = 0.90

EPS_START = 1.00
EPS_MIN = 0.05
EPS_DECAY = 0.995

EPISODES = 2000

TRAIN_SEED = 7
SCENARIO_SEED = 2026
EVAL_SEED = 991

EVALUATION_SCENARIOS = 200


# =============================================================================
# GRAPH HELPERS
# =============================================================================

def hav_coords(p, q):
    R = 6371.0

    lat1, lon1 = map(
        math.radians,
        [p[0], p[1]]
    )

    lat2, lon2 = map(
        math.radians,
        [q[0], q[1]]
    )

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )

    return 2 * R * math.asin(math.sqrt(h))


def edge_geometry(edge):
    points = [
        [
            NODES[edge["a"]]["lat"],
            NODES[edge["a"]]["lng"],
        ]
    ]

    points.extend(edge.get("bend", []))

    points.append(
        [
            NODES[edge["b"]]["lat"],
            NODES[edge["b"]]["lng"],
        ]
    )

    return points


def edge_distance(edge):
    points = edge_geometry(edge)

    distance = 0.0

    for i in range(1, len(points)):
        distance += hav_coords(
            points[i - 1],
            points[i]
        )

    return distance


EDGE_DATA = {}
ADJ = {node_id: [] for node_id in NODES}

for edge in EDGES:
    key = tuple(sorted((edge["a"], edge["b"])))

    edge = dict(edge)
    edge["km"] = edge_distance(edge)

    EDGE_DATA[key] = edge

    ADJ[edge["a"]].append(edge["b"])
    ADJ[edge["b"]].append(edge["a"])


# =============================================================================
# STEP 4 — ACCESSIBILITY A
# =============================================================================

def rain_band(mm):
    if mm < 10:
        return 0
    if mm < 30:
        return 1
    if mm < 60:
        return 2
    return 3


def weather_factor(surface, rainfall):
    b = rain_band(rainfall)

    if surface == "concrete":
        return [1.00, 1.00, 0.95, 0.85][b]

    if surface == "ford":
        return [1.00, 0.85, 0.45, 0.15][b]

    return [1.00, 0.85, 0.60, 0.35][b]


def local_risk_factor(profile, rainfall):
    b = rain_band(rainfall)

    profiles = {
        "normal_road":
            [1.00, 1.00, 0.95, 0.85],

        "mountain_path":
            [1.00, 0.90, 0.65, 0.30],

        "creek_crossing":
            [1.00, 0.80, 0.45, 0.05],

        "multi_river":
            [1.00, 0.75, 0.35, 0.05],

        "landslide_river":
            [1.00, 0.70, 0.25, 0.00],

        "boat_river":
            [1.00, 0.85, 0.55, 0.00],

        "unknown_qa":
            [1.00, 0.85, 0.60, 0.35],
    }

    return profiles.get(
        profile,
        [1.00, 1.00, 1.00, 1.00]
    )[b]


# =============================================================================
# CONTROLLED SCENARIOS
#
# D remains based on the Step 5 allocation.
# Rainfall changes between episodes so the agent learns under varying A.
#
# Demand spikes are deliberately small and generated from the same scenario
# object for both algorithms.
# =============================================================================

class Scenario:
    def __init__(self, seed):
        rng = random.Random(seed)

        self.seed = seed

        # Dynamic rainfall condition.
        self.rain = rng.uniform(0, 80)

        # Preserve Step 5 demand as baseline while allowing controlled
        # episode-level demand variation.
        self.demand = {}

        for node_id in SERVICE:
            base = NODES[node_id]["learners"]

            factor = rng.uniform(0.90, 1.10)

            self.demand[node_id] = max(
                1,
                round(base * factor)
            )


    def access(self, edge_key):
        edge = EDGE_DATA[edge_key]

        surface = edge["surf"]
        profile = edge["profile"]

        value = (
            SURF_A[surface]
            * weather_factor(surface, self.rain)
            * local_risk_factor(profile, self.rain)
        )

        return max(
            0.0,
            min(1.0, value)
        )


    def edge_min(self, a, b):
        key = tuple(sorted((a, b)))

        edge = EDGE_DATA[key]

        A = self.access(key)

        if A < 0.20:
            return None

        return (
            edge["km"]
            / SPEED[edge["surf"]]
            * 60
            / max(A, 0.08)
        )


# =============================================================================
# SHARED ENVIRONMENT FUNCTIONS
# =============================================================================

def service_min(node_id, demand):
    return SERVICE_MIN_PER_STOP


def jain(values):
    values = list(values)

    total = sum(values)
    squared = sum(x * x for x in values)

    if squared == 0:
        return 1.0

    return (
        total * total
        / (len(values) * squared)
    )


def dijkstra(scenario, start, goal):
    dist = {start: 0.0}
    seen = set()

    queue = [start]

    while queue:
        queue.sort(
            key=lambda node: dist[node]
        )

        current = queue.pop(0)

        if current in seen:
            continue

        seen.add(current)

        if current == goal:
            return dist[current]

        for neighbor in ADJ[current]:
            minutes = scenario.edge_min(
                current,
                neighbor
            )

            if minutes is None:
                continue

            new_distance = (
                dist[current]
                + minutes
            )

            if new_distance < dist.get(
                neighbor,
                float("inf")
            ):
                dist[neighbor] = new_distance
                queue.append(neighbor)

    return None


def reachable(
    scenario,
    current,
    mask,
    remaining
):
    result = []

    for node_id in SERVICE:

        if mask & (
            1 << IDX[node_id]
        ):
            continue

        travel = dijkstra(
            scenario,
            current,
            node_id
        )

        if travel is None:
            continue

        required = (
            travel
            + service_min(
                node_id,
                scenario.demand
            )
        )

        if required <= remaining:
            result.append(
                (node_id, travel)
            )

    return result


# =============================================================================
# STATE ENCODING
# =============================================================================

def time_bucket(remaining):
    ratio = max(
        0.0,
        min(
            1.0,
            remaining / SHIFT_MIN
        )
    )

    bucket = int(
        ratio * TIME_BUCKETS
    )

    return min(
        TIME_BUCKETS - 1,
        max(0, bucket)
    )


def access_bucket(value):
    if value < 0.20:
        return 0
    if value < 0.45:
        return 1
    if value < 0.75:
        return 2
    return 3


def standard_state(current):
    return current


def proposed_state(
    scenario,
    current,
    mask,
    remaining,
    visits
):
    """
    L = current location
    D = demand pressure
    T = remaining time
    H = historical visit fairness
    A = local accessibility
    """

    candidates = []

    for node_id in SERVICE:

        if mask & (
            1 << IDX[node_id]
        ):
            continue

        distance = dijkstra(
            scenario,
            current,
            node_id
        )

        if distance is not None:
            candidates.append(node_id)


    max_demand = max(
        scenario.demand.values()
    )

    demand_pressure = max(
        (
            scenario.demand[node_id]
            / max_demand
            for node_id in candidates
        ),
        default=0.0
    )

    if demand_pressure == 0:
        D = 0
    elif demand_pressure < 0.45:
        D = 1
    elif demand_pressure < 0.75:
        D = 2
    else:
        D = 3


    fairness = jain(
        visits.values()
    )

    if fairness < 0.55:
        H = 0
    elif fairness < 0.70:
        H = 1
    elif fairness < 0.85:
        H = 2
    else:
        H = 3


    local_access = []

    for neighbor in ADJ[current]:

        key = tuple(
            sorted(
                (
                    current,
                    neighbor
                )
            )
        )

        local_access.append(
            scenario.access(key)
        )


    mean_access = (
        sum(local_access)
        / len(local_access)
        if local_access
        else 0.0
    )

    A = access_bucket(
        mean_access
    )


    return (
        f"L={current}"
        f"|D={D}"
        f"|T={time_bucket(remaining)}"
        f"|H={H}"
        f"|A={A}"
    )


# =============================================================================
# Q-TABLE HELPERS
# =============================================================================

def qget(Q, state, action):
    return Q.get(
        state,
        {}
    ).get(
        action,
        0.0
    )


def qset(
    Q,
    state,
    action,
    value
):
    Q.setdefault(
        state,
        {}
    )[action] = value


# =============================================================================
# REWARDS
# =============================================================================

def reward_standard(
    travel_minutes
):
    travel_hours = max(
        travel_minutes / 60,
        1e-6
    )

    return (
        1.0
        / travel_hours
    )


def reward_modql(
    scenario,
    target,
    travel_minutes,
    visits
):
    max_demand = max(
        scenario.demand.values()
    )

    coverage = (
        scenario.demand[target]
        / max_demand
    )


    projected_visits = dict(
        visits
    )

    projected_visits[target] += 1


    fairness = jain(
        projected_visits.values()
    )


    travel_hours = max(
        travel_minutes / 60,
        1e-6
    )


    reward = (
        coverage
        * fairness
        * (
            1.0
            / travel_hours
        )
    )


    return (
        reward,
        fairness
    )


# =============================================================================
# STANDARD Q-LEARNING
# =============================================================================

def train_standard(
    scenarios,
    seed=TRAIN_SEED
):
    Q = {}

    action_rng = random.Random(
        seed
    )

    epsilon = EPS_START

    logs = []


    for episode, scenario in enumerate(
        scenarios,
        start=1
    ):
        current = "hub"
        mask = 0
        remaining = SHIFT_MIN

        visits = {
            node_id:
                NODES[node_id]["visits30"]
            for node_id in SERVICE
        }

        total_reward = 0.0


        while True:

            choices = reachable(
                scenario,
                current,
                mask,
                remaining
            )

            if not choices:
                break


            state = standard_state(
                current
            )

            actions = [
                row[0]
                for row in choices
            ]

            travel = dict(
                choices
            )


            if (
                action_rng.random()
                < epsilon
            ):
                action = action_rng.choice(
                    actions
                )

            else:
                values = [
                    qget(
                        Q,
                        state,
                        candidate
                    )
                    for candidate
                    in actions
                ]

                best_value = max(values)

                best_actions = [
                    action_id
                    for action_id, value
                    in zip(
                        actions,
                        values
                    )
                    if value
                    == best_value
                ]

                action = action_rng.choice(
                    best_actions
                )


            reward = reward_standard(
                travel[action]
            )

            total_reward += reward


            new_mask = (
                mask
                | (
                    1
                    << IDX[action]
                )
            )


            new_remaining = (
                remaining
                - travel[action]
                - SERVICE_MIN_PER_STOP
            )


            next_state = standard_state(
                action
            )


            next_actions = [
                row[0]
                for row
                in reachable(
                    scenario,
                    action,
                    new_mask,
                    new_remaining
                )
            ]


            next_q = max(
                (
                    qget(
                        Q,
                        next_state,
                        candidate
                    )
                    for candidate
                    in next_actions
                ),
                default=0.0
            )


            target = (
                reward
                + GAMMA * next_q
            )


            old_value = qget(
                Q,
                state,
                action
            )


            new_value = (
                old_value
                + ALPHA
                * (
                    target
                    - old_value
                )
            )


            qset(
                Q,
                state,
                action,
                new_value
            )


            visits[action] += 1

            current = action
            mask = new_mask
            remaining = new_remaining


        logs.append(
            total_reward
        )


        epsilon = max(
            EPS_MIN,
            epsilon * EPS_DECAY
        )


    return Q, logs


# =============================================================================
# PROPOSED DOUBLE Q-LEARNING
# =============================================================================

def train_modql(
    scenarios,
    seed=TRAIN_SEED
):
    Q1 = {}
    Q2 = {}

    action_rng = random.Random(
        seed
    )

    update_rng = random.Random(
        seed + 1000
    )

    epsilon = EPS_START

    logs = []
    spread = []


    for episode, scenario in enumerate(
        scenarios,
        start=1
    ):
        current = "hub"
        mask = 0
        remaining = SHIFT_MIN

        visits = {
            node_id:
                NODES[node_id]["visits30"]
            for node_id in SERVICE
        }

        total_reward = 0.0

        episode_spread = []


        while True:

            choices = reachable(
                scenario,
                current,
                mask,
                remaining
            )

            if not choices:
                break


            state = proposed_state(
                scenario,
                current,
                mask,
                remaining,
                visits
            )


            actions = [
                row[0]
                for row in choices
            ]

            travel = dict(
                choices
            )


            combined = {
                action:
                    qget(
                        Q1,
                        state,
                        action
                    )
                    + qget(
                        Q2,
                        state,
                        action
                    )
                for action
                in actions
            }


            if (
                action_rng.random()
                < epsilon
            ):
                action = action_rng.choice(
                    actions
                )

            else:
                best_value = max(
                    combined.values()
                )

                best_actions = [
                    action_id
                    for action_id
                    in actions
                    if combined[action_id]
                    == best_value
                ]

                action = action_rng.choice(
                    best_actions
                )


            reward, _ = reward_modql(
                scenario,
                action,
                travel[action],
                visits
            )

            total_reward += reward


            new_mask = (
                mask
                | (
                    1
                    << IDX[action]
                )
            )


            new_remaining = (
                remaining
                - travel[action]
                - SERVICE_MIN_PER_STOP
            )


            next_visits = dict(
                visits
            )

            next_visits[action] += 1


            next_state = proposed_state(
                scenario,
                action,
                new_mask,
                new_remaining,
                next_visits
            )


            next_actions = [
                row[0]
                for row
                in reachable(
                    scenario,
                    action,
                    new_mask,
                    new_remaining
                )
            ]


            if (
                update_rng.random()
                < 0.5
            ):

                if next_actions:

                    best_next = max(
                        next_actions,
                        key=lambda candidate:
                            qget(
                                Q1,
                                next_state,
                                candidate
                            )
                    )

                    bootstrap = qget(
                        Q2,
                        next_state,
                        best_next
                    )

                else:
                    bootstrap = 0.0


                target = (
                    reward
                    + GAMMA
                    * bootstrap
                )


                old_value = qget(
                    Q1,
                    state,
                    action
                )


                qset(
                    Q1,
                    state,
                    action,
                    old_value
                    + ALPHA
                    * (
                        target
                        - old_value
                    )
                )


            else:

                if next_actions:

                    best_next = max(
                        next_actions,
                        key=lambda candidate:
                            qget(
                                Q2,
                                next_state,
                                candidate
                            )
                    )

                    bootstrap = qget(
                        Q1,
                        next_state,
                        best_next
                    )

                else:
                    bootstrap = 0.0


                target = (
                    reward
                    + GAMMA
                    * bootstrap
                )


                old_value = qget(
                    Q2,
                    state,
                    action
                )


                qset(
                    Q2,
                    state,
                    action,
                    old_value
                    + ALPHA
                    * (
                        target
                        - old_value
                    )
                )


            episode_spread.append(
                abs(
                    qget(
                        Q1,
                        state,
                        action
                    )
                    - qget(
                        Q2,
                        state,
                        action
                    )
                )
            )


            visits = next_visits
            current = action
            mask = new_mask
            remaining = new_remaining


        logs.append(
            total_reward
        )


        spread.append(
            (
                sum(episode_spread)
                / len(episode_spread)
                if episode_spread
                else 0.0
            )
        )


        epsilon = max(
            EPS_MIN,
            epsilon * EPS_DECAY
        )


    return (
        Q1,
        Q2,
        logs,
        spread
    )


# =============================================================================
# EVALUATION
# =============================================================================

def rollout(
    scenario,
    Q=None,
    Q1=None,
    Q2=None,
    modql=False
):
    current = "hub"
    mask = 0
    remaining = SHIFT_MIN

    visits = {
        node_id:
            NODES[node_id]["visits30"]
        for node_id in SERVICE
    }

    travel_total = 0.0
    learners_served = 0

    route = []


    while True:

        choices = reachable(
            scenario,
            current,
            mask,
            remaining
        )

        if not choices:
            break


        actions = [
            row[0]
            for row
            in choices
        ]

        travel = dict(
            choices
        )


        if modql:

            state = proposed_state(
                scenario,
                current,
                mask,
                remaining,
                visits
            )

            values = {
                action:
                    qget(
                        Q1,
                        state,
                        action
                    )
                    + qget(
                        Q2,
                        state,
                        action
                    )
                for action
                in actions
            }

        else:

            state = standard_state(
                current
            )

            values = {
                action:
                    qget(
                        Q,
                        state,
                        action
                    )
                for action
                in actions
            }


        action = max(
            actions,
            key=lambda candidate: (
                values[candidate],
                -travel[candidate]
            )
        )


        travel_total += travel[
            action
        ]

        learners_served += (
            scenario.demand[action]
        )


        route.append(
            action
        )


        remaining -= (
            travel[action]
            + SERVICE_MIN_PER_STOP
        )


        mask |= (
            1
            << IDX[action]
        )


        visits[action] += 1

        current = action


    return {
        "travel_min":
            travel_total,

        "fairness":
            jain(
                visits.values()
            ),

        "stops":
            len(route),

        "deferred":
            len(SERVICE)
            - len(route),

        "coverage":
            learners_served,

        "route":
            route,
    }


def average(
    rows,
    key
):
    return (
        sum(
            row[key]
            for row
            in rows
        )
        / len(rows)
    )


# =============================================================================
# RUNTIME POLICY EXPORT
# =============================================================================

def greedy_standard_policy(Q):
    policy = {}

    for state, actions in Q.items():

        if not actions:
            continue

        policy[state] = max(
            actions,
            key=actions.get
        )

    return policy


def greedy_modql_policy(
    Q1,
    Q2
):
    states = set(Q1) | set(Q2)

    policy = {}

    for state in states:

        actions = (
            set(Q1.get(state, {}))
            | set(Q2.get(state, {}))
        )

        if not actions:
            continue

        policy[state] = max(
            actions,
            key=lambda action:
                qget(
                    Q1,
                    state,
                    action
                )
                + qget(
                    Q2,
                    state,
                    action
                )
        )

    return policy


def downsample(values, points=60):
    if not values:
        return []
    if len(values) <= points:
        return values
    result = []
    for i in range(points):
        index = round(i * (len(values) - 1) / (points - 1))
        result.append(values[index])
    return result


# =============================================================================
# MAIN
# =============================================================================

def main():

    # ---------------------------------------------------------
    # IDENTICAL TRAINING SCENARIOS FOR BOTH ALGORITHMS
    # ---------------------------------------------------------

    scenario_rng = random.Random(
        SCENARIO_SEED
    )

    training_seeds = [
        scenario_rng.randrange(
            1,
            10**9
        )
        for _ in range(
            EPISODES
        )
    ]


    standard_scenarios = [
        Scenario(seed)
        for seed
        in training_seeds
    ]


    modql_scenarios = [
        Scenario(seed)
        for seed
        in training_seeds
    ]


    Q, standard_log = (
        train_standard(
            standard_scenarios
        )
    )


    (
        Q1,
        Q2,
        modql_log,
        q_spread
    ) = train_modql(
        modql_scenarios
    )


    # ---------------------------------------------------------
    # IDENTICAL HELD-OUT EVALUATION SCENARIOS
    # ---------------------------------------------------------

    eval_rng = random.Random(
        EVAL_SEED
    )


    evaluation_seeds = [
        eval_rng.randrange(
            1,
            10**9
        )
        for _ in range(
            EVALUATION_SCENARIOS
        )
    ]


    evaluation_scenarios = [
        Scenario(seed)
        for seed
        in evaluation_seeds
    ]


    standard_results = [
        rollout(
            scenario,
            Q=Q
        )
        for scenario
        in evaluation_scenarios
    ]


    modql_results = [
        rollout(
            scenario,
            Q1=Q1,
            Q2=Q2,
            modql=True
        )
        for scenario
        in evaluation_scenarios
    ]


    summary = {
        "environment":
            "Barangay Laiban finalized Step 1-6 environment",

        "episodes_trained":
            EPISODES,

        "evaluation_scenarios":
            EVALUATION_SCENARIOS,

        "fair_comparison":
            "Both algorithms trained and evaluated using identical scenario seeds.",

        "official_demand_basis":
            {
                "barangay_osy_total":
                    284,

                "sitio_distribution":
                    "controlled simulated unequal distribution",
            },

        "operational_constraints":
            {
                "shift_minutes":
                    SHIFT_MIN,

                "service_minutes_per_stop":
                    SERVICE_MIN_PER_STOP,
            },

        "hyperparameters":
            {
                "alpha":
                    ALPHA,

                "gamma":
                    GAMMA,

                "epsilon_start":
                    EPS_START,

                "epsilon_min":
                    EPS_MIN,

                "epsilon_decay":
                    EPS_DECAY,
            },

        "state_design":
            {
                "standard":
                    "L",

                "modql":
                    "<L,D,T,H,A>",
            },

        "reward_design":
            {
                "standard":
                    "1 / TravelCost",

                "modql":
                    "Coverage * JainFairness * (1 / TravelCost)",
            },

        "standard":
            {
                key:
                    average(
                        standard_results,
                        key
                    )
                for key
                in [
                    "travel_min",
                    "fairness",
                    "stops",
                    "deferred",
                    "coverage",
                ]
            },

        "modql":
            {
                key:
                    average(
                        modql_results,
                        key
                    )
                for key
                in [
                    "travel_min",
                    "fairness",
                    "stops",
                    "deferred",
                    "coverage",
                ]
            },

        "data_note":
            (
                "Sitio identities and accessibility evidence are based on "
                "the Step 1-4 Laiban dataset. Sitio demand allocation, "
                "initial historical service H, and operational time T "
                "remain controlled simulation inputs where sitio-level "
                "official records were unavailable."
            ),
    }


    # ---------------------------------------------------------
    # SAVE SUMMARY
    # ---------------------------------------------------------

    (
        OUT
        / "comparison_summary.json"
    ).write_text(
        json.dumps(
            summary,
            indent=2
        ),
        encoding="utf-8"
    )


    # ---------------------------------------------------------
    # SAVE RAW Q TABLES
    # ---------------------------------------------------------

    (
        OUT
        / "standard_policy.json"
    ).write_text(
        json.dumps(
            {
                "q": Q
            },
            separators=(",", ":")
        ),
        encoding="utf-8"
    )


    (
        OUT
        / "modql_policy.json"
    ).write_text(
        json.dumps(
            {
                "q1": Q1,
                "q2": Q2,
            },
            separators=(",", ":")
        ),
        encoding="utf-8"
    )

    # ---------------------------------------------------------
    # EXPORT POLICY FOR BROWSER SYSTEM
    # ---------------------------------------------------------

    runtime_policy = {
        "version": "laiban-step8-aligned-v1",
        "episodes_trained": EPISODES,
        "evaluation_scenarios": EVALUATION_SCENARIOS,
        "node_bit_index": IDX,
        "state_design": {
            "standard": "L",
            "modql": "<L,D,T,H,A>",
        },
        "reward_design": {
            "standard": "1 / TravelCost",
            "modql": "Coverage * JainFairness * (1 / TravelCost)",
        },
        "evaluation_summary": summary,
        "training_curves": {
            "episode": downsample(list(range(1, EPISODES + 1))),
            "standard_reward": downsample(standard_log),
            "modql_reward": downsample(modql_log),
            "q1_q2_spread": downsample(q_spread),
        },
        "standard_policy": greedy_standard_policy(Q),
        "modql_policy": greedy_modql_policy(Q1, Q2),
        "standard_q": Q,
        "q1": Q1,
        "q2": Q2,
    }

    js = (
        "/* AUTO-GENERATED by training/train_q_learning.py. Do not hand-edit. */\n"
        "var TRAINED_POLICY="
        + json.dumps(runtime_policy, separators=(",", ":"))
        + ";\n"
    )

    (ROOT / "trained_policy.js").write_text(js, encoding="utf-8")

    # ---------------------------------------------------------
    # TRAINING LOG
    # ---------------------------------------------------------

    with (
        OUT
        / "training_log.csv"
    ).open(
        "w",
        newline="",
        encoding="utf-8"
    ) as file:

        writer = csv.writer(
            file
        )

        writer.writerow(
            [
                "episode",
                "standard_reward",
                "modql_reward",
                "mean_q1_q2_spread",
            ]
        )


        for episode, (
            standard_reward,
            modql_reward,
            spread
        ) in enumerate(
            zip(
                standard_log,
                modql_log,
                q_spread
            ),
            start=1
        ):

            writer.writerow(
                [
                    episode,
                    standard_reward,
                    modql_reward,
                    spread,
                ]
            )


    print(
        json.dumps(
            summary,
            indent=2
        )
    )


    print(
        "\nTraining complete."
    )

    print(
        "Generated:",
        ROOT / "trained_policy.js"
    )
    print(
        "Outputs:",
        OUT
    )
if __name__ == "__main__":
    main()