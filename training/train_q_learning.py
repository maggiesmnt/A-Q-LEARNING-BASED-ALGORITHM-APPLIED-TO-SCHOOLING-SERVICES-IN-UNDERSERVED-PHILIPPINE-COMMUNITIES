"""Research-aligned training script for Standard Q-Learning vs MODQL.

Chapter 3 mapping
-----------------
Existing/control:
  - Standard single-table Q-Learning
  - location-only state S=L
  - single-objective travel-efficiency reward

Proposed/experimental MODQL:
  - two independent tables Q1 and Q2
  - enriched state S=<L,D,T,H,A>
  - reward R = Coverage * JainFairness * (1 / TravelCost)

The environment uses the repository's placeholder Laiban/Tanay nodes until the
requested DepEd/OSM/PAGASA data are available. Outputs are simulation evidence,
not final Chapter 4 results.
"""

import csv, json, math, random
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).with_name('outputs_aligned')
OUT.mkdir(exist_ok=True)

NODES = {
    'hub': dict(kind='depot', lat=14.5762, lng=121.3828, learners=0, visits30=0),
    'mah': dict(kind='node', lat=14.5921, lng=121.4026, learners=48, visits30=2),
    'kab': dict(kind='node', lat=14.5606, lng=121.4131, learners=63, visits30=1),
    'dar': dict(kind='node', lat=14.6108, lng=121.4315, learners=87, visits30=3),
    'tin': dict(kind='node', lat=14.6204, lng=121.4402, learners=41, visits30=0),
    'inz': dict(kind='node', lat=14.5512, lng=121.3562, learners=72, visits30=2),
    'cay': dict(kind='node', lat=14.5292, lng=121.3396, learners=56, visits30=2),
    'pun': dict(kind='node', lat=14.5446, lng=121.4288, learners=34, visits30=0),
    'amp': dict(kind='node', lat=14.6018, lng=121.3548, learners=29, visits30=1),
}
SERVICE = [n for n,v in NODES.items() if v['kind']=='node']
IDX = {n:i for i,n in enumerate(SERVICE)}
EDGES = [
    ('hub','inz','concrete'),('inz','cay','concrete'),('hub','amp','gravel'),('hub','mah','gravel'),
    ('amp','dar','dirt'),('mah','dar','gravel'),('dar','tin','ford'),('mah','kab','dirt'),
    ('kab','pun','dirt'),('inz','kab','dirt'),('cay','pun','dirt')
]
SURF_A={'concrete':1.0,'gravel':0.85,'dirt':0.65,'ford':0.50}
SPEED={'concrete':38,'gravel':24,'dirt':16,'ford':12}
ALPHA=.1; GAMMA=.9; EPS_START=1.0; EPS_MIN=.05; EPS_DECAY=.995; EPISODES=1200; SHIFT=480; TB=6


def hav(a,b):
    R=6371.0
    la1,lo1,la2,lo2=map(math.radians,[NODES[a]['lat'],NODES[a]['lng'],NODES[b]['lat'],NODES[b]['lng']])
    dla,dlo=la2-la1,lo2-lo1
    h=math.sin(dla/2)**2+math.cos(la1)*math.cos(la2)*math.sin(dlo/2)**2
    return 2*R*math.asin(math.sqrt(h))

EDGE_KM={}; EDGE_SURF={}; ADJ=defaultdict(list)
for a,b,s in EDGES:
    k=tuple(sorted((a,b))); EDGE_KM[k]=hav(a,b); EDGE_SURF[k]=s; ADJ[a].append(b); ADJ[b].append(a)


def service_min(n,demand): return 25+round(demand[n]/3)
def jain(vals):
    vals=list(vals); s=sum(vals); q=sum(x*x for x in vals)
    return 1.0 if q==0 else (s*s)/(len(vals)*q)

class Scenario:
    def __init__(self,rng):
        self.rain=rng.uniform(0,80)
        self.demand={n:max(1,round(NODES[n]['learners']*rng.uniform(.75,1.25))) for n in SERVICE}
        self.hazard=None; self.sev=None
        if rng.random()<.35:
            self.hazard=rng.choice(list(EDGE_KM)); self.sev=rng.choice(['impassable','major','minor'])
    def access(self,k):
        surf=EDGE_SURF[k]
        band=0 if self.rain<10 else 1 if self.rain<30 else 2 if self.rain<60 else 3
        wf=([1,1,.95,.85] if surf=='concrete' else [1,.85,.45,.15] if surf=='ford' else [1,.85,.60,.35])[band]
        hf=1.0 if self.hazard!=k else {'impassable':.05,'major':.40,'minor':.72}[self.sev]
        return max(0,min(1,SURF_A[surf]*wf*hf))
    def edge_min(self,a,b):
        k=tuple(sorted((a,b))); A=self.access(k)
        if A<.20: return None
        return EDGE_KM[k]/SPEED[EDGE_SURF[k]]*60/max(A,.08)


def dijkstra(sc,start,goal):
    dist={start:0.0}; seen=set(); q=[start]
    while q:
        q.sort(key=lambda x:dist[x]); cur=q.pop(0)
        if cur in seen: continue
        seen.add(cur)
        if cur==goal: return dist[cur]
        for nb in ADJ[cur]:
            m=sc.edge_min(cur,nb)
            if m is None: continue
            nd=dist[cur]+m
            if nd<dist.get(nb,1e99): dist[nb]=nd; q.append(nb)
    return None

def reachable(sc,cur,mask,remaining):
    out=[]
    for n in SERVICE:
        if mask&(1<<IDX[n]): continue
        d=dijkstra(sc,cur,n)
        if d is not None and d+service_min(n,sc.demand)<=remaining: out.append((n,d))
    return out

def t_bucket(rem): return min(TB-1,max(0,int((rem/SHIFT)*TB)))
def access_bucket(x): return 0 if x<.20 else 1 if x<.45 else 2 if x<.75 else 3

def standard_state(cur): return cur

def proposed_state(sc,cur,mask,remaining,visits):
    """Finite tabular encoding of every Chapter 3 state dimension.

    L: current location.
    D: demand-pressure bucket among currently reachable, unserved communities.
    T: remaining-time bucket.
    H: historical-service/fairness bucket from the visit-frequency vector.
    A: local road-accessibility bucket around the current location.

    The raw D/H/A vectors are observed every step; bucketed summaries keep the
    tabular state space learnable within the paper's 500-2,000 episode range.
    """
    candidates=[]
    for n in SERVICE:
        if mask&(1<<IDX[n]): continue
        d=dijkstra(sc,cur,n)
        if d is not None: candidates.append(n)
    mx=max(sc.demand.values())
    demand_pressure=max((sc.demand[n]/mx for n in candidates),default=0.0)
    D=0 if demand_pressure==0 else 1 if demand_pressure<.45 else 2 if demand_pressure<.75 else 3
    J=jain(visits.values())
    H=0 if J<.55 else 1 if J<.70 else 2 if J<.85 else 3
    local=[]
    for nb in ADJ[cur]: local.append(sc.access(tuple(sorted((cur,nb)))))
    meanA=sum(local)/len(local) if local else 0
    A=access_bucket(meanA)
    return f'L={cur}|D={D}|T={t_bucket(remaining)}|H={H}|A={A}'

def qget(Q,s,a): return Q.get(s,{}).get(a,0.0)
def qset(Q,s,a,v): Q.setdefault(s,{})[a]=v

def reward_modql(sc,target,travel,visits):
    cov=sc.demand[target]/max(sc.demand.values())
    trial=dict(visits); trial[target]+=1
    J=jain(trial.values()); cost=max(travel/60,1e-6)
    return cov*J*(1/cost),J

def reward_std(travel): return 1/max(travel/60,1e-6)

def choose(Q,s,acts,eps,rng):
    if rng.random()<eps: return rng.choice(acts)
    vals=[qget(Q,s,a) for a in acts]; m=max(vals); best=[a for a,v in zip(acts,vals) if v==m]
    return rng.choice(best)

def train_standard(seed=7):
    Q={}; rng=random.Random(seed); eps=EPS_START; logs=[]
    for ep in range(EPISODES):
        sc=Scenario(rng); cur='hub'; mask=0; rem=SHIFT; visits={n:NODES[n]['visits30'] for n in SERVICE}; total=0
        while True:
            choices=reachable(sc,cur,mask,rem)
            if not choices: break
            s=standard_state(cur); acts=[x[0] for x in choices]; travel=dict(choices)
            a=choose(Q,s,acts,eps,rng); r=reward_std(travel[a]); total+=r
            nm=mask|(1<<IDX[a]); nr=rem-travel[a]-service_min(a,sc.demand); ns=standard_state(a)
            nxt=[x[0] for x in reachable(sc,a,nm,nr)]
            target=r+(GAMMA*max((qget(Q,ns,x) for x in nxt),default=0))
            old=qget(Q,s,a); qset(Q,s,a,old+ALPHA*(target-old))
            visits[a]+=1; cur,mask,rem=a,nm,nr
        logs.append(total); eps=max(EPS_MIN,eps*EPS_DECAY)
    return Q,logs

def train_modql(seed=7):
    Q1={}; Q2={}; rng=random.Random(seed); eps=EPS_START; logs=[]; spread=[]
    for ep in range(EPISODES):
        sc=Scenario(rng); cur='hub'; mask=0; rem=SHIFT; visits={n:NODES[n]['visits30'] for n in SERVICE}; total=0; diffs=[]
        while True:
            choices=reachable(sc,cur,mask,rem)
            if not choices: break
            s=proposed_state(sc,cur,mask,rem,visits); acts=[x[0] for x in choices]; travel=dict(choices)
            combo={a:qget(Q1,s,a)+qget(Q2,s,a) for a in acts}
            if rng.random()<eps: a=rng.choice(acts)
            else:
                m=max(combo.values()); a=rng.choice([x for x in acts if combo[x]==m])
            r,_=reward_modql(sc,a,travel[a],visits); total+=r
            nm=mask|(1<<IDX[a]); nr=rem-travel[a]-service_min(a,sc.demand)
            next_vis=dict(visits); next_vis[a]+=1
            ns=proposed_state(sc,a,nm,nr,next_vis); nxt=[x[0] for x in reachable(sc,a,nm,nr)]
            if rng.random()<.5:
                astar=max(nxt,key=lambda x:qget(Q1,ns,x)) if nxt else None
                target=r+(GAMMA*qget(Q2,ns,astar) if astar else 0)
                old=qget(Q1,s,a); qset(Q1,s,a,old+ALPHA*(target-old))
            else:
                astar=max(nxt,key=lambda x:qget(Q2,ns,x)) if nxt else None
                target=r+(GAMMA*qget(Q1,ns,astar) if astar else 0)
                old=qget(Q2,s,a); qset(Q2,s,a,old+ALPHA*(target-old))
            diffs.append(abs(qget(Q1,s,a)-qget(Q2,s,a)))
            visits=next_vis; cur,mask,rem=a,nm,nr
        logs.append(total); spread.append(sum(diffs)/len(diffs) if diffs else 0); eps=max(EPS_MIN,eps*EPS_DECAY)
    return Q1,Q2,logs,spread

def rollout(sc,Q=None,Q1=None,Q2=None,mod=False):
    cur='hub'; mask=0; rem=SHIFT; visits={n:NODES[n]['visits30'] for n in SERVICE}; travel_sum=0; covered=0; seq=[]
    while True:
        choices=reachable(sc,cur,mask,rem)
        if not choices: break
        acts=[x[0] for x in choices]; tm=dict(choices)
        if mod:
            s=proposed_state(sc,cur,mask,rem,visits)
            vals={a:qget(Q1,s,a)+qget(Q2,s,a) for a in acts}
        else:
            s=standard_state(cur); vals={a:qget(Q,s,a) for a in acts}
        best=max(acts,key=lambda a:(vals[a],-tm[a]))
        travel_sum+=tm[best]; covered+=sc.demand[best]; seq.append(best)
        rem-=tm[best]+service_min(best,sc.demand); mask|=1<<IDX[best]; visits[best]+=1; cur=best
    return dict(travel_min=travel_sum,fairness=jain(visits.values()),stops=len(seq),deferred=len(SERVICE)-len(seq),coverage=covered,route=seq)

def avg(rows,key): return sum(r[key] for r in rows)/len(rows)

def main():
    Q,std_log=train_standard(); Q1,Q2,mod_log,spread=train_modql()
    eval_rng=random.Random(991); scenarios=[Scenario(eval_rng) for _ in range(100)]
    std=[rollout(sc,Q=Q) for sc in scenarios]; mod=[rollout(sc,Q1=Q1,Q2=Q2,mod=True) for sc in scenarios]
    summary={
      'episodes_trained':EPISODES,'evaluation_scenarios':len(scenarios),
      'hyperparameters':{'alpha':ALPHA,'gamma':GAMMA,'eps_start':EPS_START,'eps_min':EPS_MIN,'eps_decay':EPS_DECAY},
      'state_design':{
        'standard':'L (current location only)',
        'modql':'<L,D,T,H,A> with direct discretized demand, time, history/fairness, and local accessibility features'
      },
      'reward_design':{'standard':'1 / travel_cost','modql':'coverage * Jain_fairness * (1 / travel_cost)'},
      'standard':{k:avg(std,k) for k in ['travel_min','fairness','stops','deferred','coverage']},
      'modql':{k:avg(mod,k) for k in ['travel_min','fairness','stops','deferred','coverage']},
      'data_note':'Placeholder Laiban/Tanay node and road data; not final Chapter 4 evidence. Re-run after official datasets are inserted.'
    }
    (OUT/'comparison_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    (OUT/'standard_policy.json').write_text(json.dumps({'q':Q},separators=(',',':')),encoding='utf-8')
    (OUT/'modql_policy.json').write_text(json.dumps({'q1':Q1,'q2':Q2},separators=(',',':')),encoding='utf-8')
    with (OUT/'training_log.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.writer(f); w.writerow(['episode','standard_reward','modql_reward','mean_q1_q2_spread'])
        for i,(a,b,c) in enumerate(zip(std_log,mod_log,spread),1): w.writerow([i,a,b,c])
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
