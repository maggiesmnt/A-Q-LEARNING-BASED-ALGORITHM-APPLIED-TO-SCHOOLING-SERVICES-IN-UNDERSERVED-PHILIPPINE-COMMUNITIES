#!/usr/bin/env python3
"""
visualize_policy.py
=============================================================================
This does NOT reimplement your algorithm. It imports train_q_learning.py
directly and uses its actual functions -- the same NODES/EDGES map from
engine.js, the same WeatherDay hazard model, the same reachable_actions(),
the same jain_index()/proposed_reward(), the same train_double_q()/
train_standard_q() training loops. Everything you see on screen is the
real output of that script, not a picture or a hand-authored number.

WHAT THIS SCRIPT ADDS (visualization only, zero algorithm logic):
  - Places the real lat/lng nodes on a 2D canvas
  - Trains BOTH agents live when you run it (takes a few seconds)
  - Lets you replay either trained policy, one road-segment at a time,
    on the SAME weather/hazard scenario for a fair side-by-side
  - Shows the live Coverage / Fairness(J) / Reward numbers as they're
    actually computed by proposed_reward()/jain_index()

Place this file in the SAME folder as train_q_learning.py, then run:
    py visualize_policy.py

Controls:
    1       -- replay the STANDARD (existing) trained policy for today
    2       -- replay the PROPOSED (MODQL) trained policy for today
    N       -- new random weather/hazard day
    SPACE   -- pause/resume the current replay
    ESC     -- quit
=============================================================================
"""
import sys
import os
import random

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Everything below is imported, not rewritten. If train_q_learning.py's
# algorithm ever changes, this script automatically reflects that change.
from train_q_learning import (
    NODES, EDGES, SERVICE_NODES, NODE_IDX, SHIFT_MIN,
    WeatherDay, reachable_actions, encode_state, service_min,
    jain_index, proposed_reward, baseline_reward,
    train_double_q, train_standard_q,
    make_modql_policy, make_standard_policy,
    MAX_LEARNERS,
)

import pygame

WIDTH, HEIGHT = 1150, 700
GRAPH_RECT = (330, 40, 780, 560)  # x, y, w, h
STEP_DELAY_MS = 900


# ---------------------------------------------------------------------------
# Screen layout: map real lat/lng straight onto the canvas
# ---------------------------------------------------------------------------
def compute_positions():
    lats = [n["lat"] for n in NODES.values()]
    lngs = [n["lng"] for n in NODES.values()]
    lat_min, lat_max = min(lats), max(lats)
    lng_min, lng_max = min(lngs), max(lngs)
    x0, y0, w, h = GRAPH_RECT
    pad = 60
    pos = {}
    for nid, n in NODES.items():
        fx = (n["lng"] - lng_min) / (lng_max - lng_min or 1)
        fy = (n["lat"] - lat_min) / (lat_max - lat_min or 1)
        x = x0 + pad + fx * (w - 2 * pad)
        y = y0 + pad + (1 - fy) * (h - 2 * pad)  # invert: higher lat = higher on screen
        pos[nid] = (x, y)
    return pos


def band_color(a):
    # Same thresholds as engine.js's band(): open/caution/restricted/closed
    if a >= 0.75:
        return (60, 170, 90)     # open
    if a >= 0.45:
        return (200, 150, 40)    # caution
    if a >= 0.20:
        return (200, 100, 50)    # restricted
    return (170, 60, 60)         # closed


# ---------------------------------------------------------------------------
# Animated rollout -- mirrors train_q_learning.py's rollout() step-by-step,
# using the exact same imported functions, but yields each step instead of
# only returning a final summary, so it can be drawn one move at a time.
# ---------------------------------------------------------------------------
def animated_rollout(weather, policy_fn, kind):
    cur, mask, remaining = "hub", 0, SHIFT_MIN
    visits = {nid: NODES[nid]["visits30"] for nid in SERVICE_NODES}
    served = []
    while True:
        actions = reachable_actions(weather, cur, mask, remaining, visits)
        if not actions:
            break
        action_ids = [a for a, _ in actions]
        travel_of = dict(actions)
        state = encode_state(cur, mask, remaining)
        action = policy_fn(state, action_ids)
        travel_min = travel_of[action]

        if kind == "modql":
            reward, fairness = proposed_reward(action, travel_min, visits, mask)
        else:
            reward = baseline_reward(travel_min)
            fairness = jain_index(visits.values())
        coverage = NODES[action]["learners"] / MAX_LEARNERS

        visits[action] = visits.get(action, 0) + 1
        mask |= (1 << NODE_IDX[action])
        remaining -= (travel_min + service_min(action))
        served.append(action)

        yield {
            "from": cur, "to": action, "travel_min": travel_min,
            "reward": reward, "coverage": coverage, "fairness": fairness,
            "remaining": remaining, "served": list(served),
            "learners": NODES[action]["learners"],
        }
        cur = action


# ---------------------------------------------------------------------------
# Pygame visualization
# ---------------------------------------------------------------------------
def main():
    print("Training on the real NODES/EDGES from train_q_learning.py...")
    print("(This is a live training run, not a saved file -- takes a few seconds.)")
    Q1, Q2, log_modql = train_double_q()
    Q_std, log_std = train_standard_q()
    print(f"Done training. {len(log_modql)} MODQL episodes, {len(log_std)} Standard episodes.")

    modql_policy = make_modql_policy(Q1, Q2)
    standard_policy = make_standard_policy(Q_std)

    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Trained Policy Replay -- train_q_learning.py (live)")
    font = pygame.font.Font(None, 22)
    font_small = pygame.font.Font(None, 18)
    clock = pygame.time.Clock()

    pos = compute_positions()

    day_seed = random.randint(0, 999999)
    weather = WeatherDay(random.Random(day_seed))

    gen = None
    kind_running = None
    last_step = None
    steps_log = []
    paused = False
    last_advance = 0
    total_reward = 0.0

    def new_day():
        nonlocal day_seed, weather
        day_seed = random.randint(0, 999999)
        weather = WeatherDay(random.Random(day_seed))

    def start_replay(kind):
        nonlocal gen, kind_running, last_step, steps_log, total_reward
        rng_copy = random.Random(day_seed)
        w = WeatherDay(rng_copy)  # identical hazards/rain to the current day
        policy_fn = modql_policy if kind == "modql" else standard_policy
        gen = animated_rollout(w, policy_fn, kind)
        kind_running = kind
        last_step = None
        steps_log = []
        total_reward = 0.0

    running = True
    while running:
        now = pygame.time.get_ticks()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_1:
                    start_replay("standard")
                elif event.key == pygame.K_2:
                    start_replay("modql")
                elif event.key == pygame.K_n:
                    new_day()
                    gen = None
                    kind_running = None
                    last_step = None
                    steps_log = []
                elif event.key == pygame.K_SPACE:
                    paused = not paused

        if gen is not None and not paused and now - last_advance > STEP_DELAY_MS:
            last_advance = now
            try:
                last_step = next(gen)
                steps_log.append(last_step)
                total_reward += last_step["reward"]
            except StopIteration:
                gen = None

        # ---- draw ----
        screen.fill((250, 247, 240))

        for e in EDGES:
            a_key = tuple(sorted((e[0], e[1])))
            acc = weather.accessibility(a_key)
            color = band_color(acc)
            pygame.draw.line(screen, color, pos[e[0]], pos[e[1]], 4 if acc >= 0.20 else 2)

        for nid, n in NODES.items():
            x, y = pos[nid]
            served_now = last_step and nid in last_step["served"]
            is_current = last_step and nid == last_step["to"]
            if nid == "hub":
                color = (60, 60, 60)
                r = 12
            else:
                color = (40, 120, 200) if served_now else (150, 150, 150)
                r = 8 + int(14 * (n["learners"] / MAX_LEARNERS))
            pygame.draw.circle(screen, color, (int(x), int(y)), r)
            if is_current:
                pygame.draw.circle(screen, (220, 30, 30), (int(x), int(y)), r + 6, 3)
            label = font_small.render(n["name"].replace("Sitio ", ""), True, (30, 30, 30))
            screen.blit(label, (x - label.get_width() // 2, y + r + 4))

        # ---- HUD ----
        lines = [
            "Trained Policy Replay (train_q_learning.py, live)",
            f"Day seed: {day_seed}   Rain: {weather.mm:.0f} mm/24h"
            + (f"   Hazard: {weather.hazard_severity} on a road" if weather.hazard_edge else ""),
            "",
            "Press 1: replay STANDARD (existing) policy",
            "Press 2: replay PROPOSED (MODQL) policy",
            "Press N: new random day     SPACE: pause",
            "",
            f"Currently showing: {kind_running or '(nothing yet -- press 1 or 2)'}",
        ]
        if last_step:
            lines += [
                "",
                f"Last move: {NODES[last_step['from']]['name'].replace('Sitio ','')} -> "
                f"{NODES[last_step['to']]['name'].replace('Sitio ','')}",
                f"Travel: {last_step['travel_min']:.1f} min",
                f"Coverage: {last_step['coverage']:.2f}   Fairness J: {last_step['fairness']:.3f}",
                f"Reward this stop: {last_step['reward']:.3f}",
                f"Cumulative reward: {total_reward:.3f}",
                f"Communities served so far: {len(last_step['served'])}/{len(SERVICE_NODES)}",
                f"Time remaining: {max(0,last_step['remaining']):.0f} min",
            ]
        for i, text in enumerate(lines):
            surf = font.render(text, True, (20, 20, 20))
            screen.blit(surf, (16, 16 + i * 24))

        pygame.display.flip()
        clock.tick(30)

    pygame.quit()


if __name__ == "__main__":
    main()
