import json, math, numpy as np, sys
plan=json.load(open('plan.json')); E=plan['E']; TOT=plan['TOT']
OUT=sys.argv[1]
start={}; s=0
for e in E: start[e['id']]=s; s+=e['length']
end=lambda i: start[i]+next(e['length'] for e in E if e['id']==i)
mid=lambda i:(start[i]+end(i))/2
# ---- sections --------------------------------------------------------------
CUT1=start['dunlop']-15.0            # sector 1 ends just before the Dunlop corner
CUT2=start['final-entry']-100.0      # sector 2 ends at the 100 m board before the final corner
cuts=[0.0,CUT1,CUT2,TOT]
def split(E):
    secs=[[],[],[]]; s=0
    for e in E:
        a,b=s,s+e['length']; s=b
        for k in range(3):
            lo,hi=max(a,cuts[k]),min(b,cuts[k+1])
            if hi-lo>1e-9:
                d=dict(kind=e['kind'],id=e['id'],length=(e['length'] if (hi-lo)>e['length']-1e-9 else round(hi-lo,9)))
                if e['kind']=='arc': d.update(radius=e['radius'],turn=e['turn'])
                secs[k].append(d)
    return secs
secs=split(E)
SID=['sector-1','sector-2','sector-3']
def joints(k):
    j=[]; s=0
    for e in secs[k]: j.append((e['id'],s)); s+=e['length']
    j.append(('end',s)); return j
J=[joints(k) for k in range(3)]
L=[cuts[k+1]-cuts[k] for k in range(3)]
def pos(k,s):
    s=min(max(s,0.0),L[k])
    """Position in Section k at local station s: measured from the nearest joint, the earlier of two as near."""
    best=min(J[k],key=lambda j:(round(abs(s-j[1]),9),j[1]))
    off=s-best[1]
    return {'joint':best[0],'offset':0 if abs(off)<1e-9 else round(off,6)}
# ---- profile ---------------------------------------------------------------
sz=np.load('profile_sz.npy'); ps=sz[:,0]*TOT/2045.0; pz=sz[:,1]
def zraw(s):
    s=s%TOT; return np.interp(s,ps,pz)
def zs(s,w=6.0):
    t=np.linspace(-w,w,13); return float(np.mean([zraw(s+u) for u in t]))
z0=zs(0.0)
STEP=20.0; CURVE=19.0
grid=[i*STEP for i in range(1,int(TOT/STEP)+1) if i*STEP<TOT-1e-6]
pvi=[(g,round(zs(g)-z0,2)) for g in grid]
seams=[0.0,CUT1,CUT2,TOT]
# beside each seam the profile is one straight line through two PVIs 10 m either side, so heights and grades agree there
pvi=[(g,y) for g,y in pvi if min(abs(g-c) for c in seams)>=16.0]
for c in seams[:3]:
    for t in (c-10.0,c+10.0): pvi.append((t%TOT,round(zs(t)-z0,2)))
pvi.sort()
def yline(s):
    P=[(pvi[-1][0]-TOT,pvi[-1][1])]+pvi+[(pvi[0][0]+TOT,pvi[0][1])]
    for (a,ya),(b,yb) in zip(P,P[1:]):
        if a<=s<=b: return ya+(yb-ya)*(s-a)/(b-a)
def curve(i):
    g=pvi[i][0]; prev=pvi[i-1][0] if i else pvi[-1][0]-TOT; nxt=pvi[i+1][0] if i+1<len(pvi) else pvi[0][0]+TOT
    return math.floor(min(CURVE,0.98*(g-prev),0.98*(nxt-g))*10)/10
profiles=[]
for k in range(3):
    kn=[{'at':pos(k,0.0),'y':round(yline(cuts[k]),3),'curveLength':0}]
    for i,(g,y) in enumerate(pvi):
        if cuts[k]<g<cuts[k+1]: kn.append({'at':pos(k,g-cuts[k]),'y':y,'curveLength':curve(i)})
    kn.append({'at':pos(k,L[k]),'y':round(yline(cuts[k+1]) if k<2 else yline(0.0),3),'curveLength':0})
    profiles.append(kn)
# ---- widths (official drawing, stations No.1-28) ---------------------------
W=[(0.0,17.03),(92.0,19.75),(start['t1-entry'],15.05),(start['t1'],13.10),(end('t1'),10.10),(start['s1'],10.10),(end('s1'),10.45),
   (start['s2'],10.25),(end('s2'),10.35),(start['hairpin1'],10.35),(mid('hairpin1'),13.25),(end('hairpin1'),10.30),
   (start['dunlop'],10.25),(end('dunlop'),13.40),(start['r80'],14.25),(end('r80'),10.50),(start['left-fast'],10.25),(end('left-fast'),10.25),
   (start['hairpin2'],10.25),(mid('hairpin2'),13.00),(end('hairpin2'),11.90),(end('hairpin2-exit'),10.40),(start['back']+200.0,10.30),
   (start['final-entry'],10.26),(start['final-exit'],10.95),(end('final-exit'),17.20),(TOT,17.03)]
def width(s): return float(np.interp(s,[a for a,_ in W],[b for _,b in W]))
def lanes(k):
    st=[0.0]+[a-cuts[k] for a,_ in W if cuts[k]+1e-6<a<cuts[k+1]-1e-6]+[L[k]]
    wl=[{'at':pos(k,t),'width':round(width(cuts[k]+t)/3,3)} for t in st]
    return [{'kind':'lane','id':i,'width':wl} for i in 'abc']
# ---- ground ----------------------------------------------------------------
GRASS,ASPHALT,WHITE=5575,9548,32765
VERGE=14.0
def centre(ds=2.0):
    out=[]; x=z=h=0.; s0=0.
    for e in E:
        Lg=e['length']; n=max(2,int(Lg/ds)); t=np.linspace(0,Lg,n,endpoint=False)
        if e['kind']=='straight': xs=x+t*math.sin(h); zs=z+t*math.cos(h); hs=np.full(n,h); c=0
        else:
            c=(1 if e['turn']=='right' else -1)/e['radius']; xs=x+(-np.cos(h+c*t)+math.cos(h))/c; zs=z+(np.sin(h+c*t)-math.sin(h))/c; hs=h+c*t
        out+=[(s0+tt,a_,b_,hh,c) for tt,a_,b_,hh in zip(t,xs,zs,hs)]
        if e['kind']=='straight': x+=Lg*math.sin(h); z+=Lg*math.cos(h)
        else: x+=(-math.cos(h+c*Lg)+math.cos(h))/c; z+=(math.sin(h+c*Lg)-math.sin(h))/c; h+=c*Lg
        s0+=Lg
    return np.array(out)
CL=centre()
REACH,MARGIN=4.0,1.5
def room(side):
    """Along the lap, how far the ground may reach from the centreline on one side: half way to any other part of the
    same Section, and well inside the centre of a tight arc."""
    sign=1 if side=='right' else -1; out=[]
    sec=np.searchsorted(cuts,CL[:,0],side='right')-1
    for i,(si,xi,zi,hi,ci) in enumerate(CL):
        n=np.array([math.cos(hi),-math.sin(hi)])*sign      # unit normal to that side (x right of +Z heading)
        lim=60.0
        m=(sec==sec[i])&(np.abs(CL[:,0]-si)>60.0)
        d=CL[m,1:3]-[xi,zi]; proj=d@n; dist2=(d**2).sum(1)
        ok=proj>0.3*np.sqrt(dist2)
        if ok.any(): lim=min(lim,float((dist2[ok]/(2*proj[ok])).min())-REACH-MARGIN)
        if ci*sign>0: lim=min(lim,1/abs(ci)-10.0)
        out.append(lim)
    out=np.array(out)
    # the least over 10 m either side, so the edge never cuts a corner of the limit
    w=5; out=np.array([out[max(0,i-w):i+w+1].min() for i in range(len(out))])
    return out
ROOM={side:room(side) for side in ('left','right')}
def verge_profile(side):
    ev=[]
    JT=sorted(set([0.0]+[start[e['id']] for e in E]+cuts[1:3]))
    ST=sorted(JT+[float(t) for t in np.arange(10.0,TOT,10.0) if min(abs(t-j) for j in JT+[TOT])>4.0])
    for t in ST:
        i=int(np.argmin(np.abs(CL[:,0]-t)))
        v=min(VERGE,ROOM[side][i]-width(t)/2)
        ev.append((float(t),round(max(1.0,float(v)),1)))
    ev.append((TOT,ev[0][1]))
    # keep only the knots where the width changes slope
    keep=[ev[0]]
    for p,q,r in zip(ev,ev[1:],ev[2:]):
        if abs((q[1]-p[1])-(r[1]-q[1]))>1e-9: keep.append(q)
    keep.append(ev[-1]); return keep
import os
DECOR=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'decor.json')))
def lat(v):
    if isinstance(v,dict):
        if 'verge' in v: return {'boundary':'verge-'+v['verge'],'offset':v.get('offset',0)}
        if 'road' in v: return {'boundary':'road-'+v['road'],'offset':v.get('offset',0)}
    return v
def sprites(k):
    out=[]
    for d in DECOR['sprites']:
        if not (cuts[k]<=d['s']<cuts[k+1]): continue
        sp={'kind':'sprite','image':d['image'],'palette':'original','at':pos(k,round(d['s']-cuts[k],3)),'lateral':lat(d['l']),
            'groundOffset':d.get('up',0),'unselectedLink':None,'body':None}
        if 'count' in d:
            n=min(d['count'],int((cuts[k+1]-0.01-d['s'])//d['every'])+1)
            sp={'kind':'repeat','every':d['every'],'count':n,'elements':[sp]} if n>=2 else sp
        out.append(sp)
    return out
def pieces(a,b,k):
    """The part of the lap interval [a,b] inside Section k, as local stations; None when empty."""
    lo,hi=max(a,cuts[k]),min(b,cuts[k+1])
    return (lo-cuts[k],hi-cuts[k]) if hi-lo>0.5 else None
def walls(k):
    out=[]
    for side in ('left','right'):
        strips=[]
        for z in DECOR['walls']:
            if z['side']!=side: continue
            p=pieces(z['from'],z['to'],k)
            if p: strips.append({'kind':'strip','color':z['color'],'knots':[{'at':pos(k,round(p[0],3)),'bottom':z.get('bottom',0),'top':z['top']},{'at':pos(k,round(p[1],3)),'bottom':z.get('bottom',0),'top':z['top']}]})
        if strips: out.append({'boundary':'verge-'+side,'start':pos(k,0.0),'end':pos(k,L[k]),'solid':None,'strips':strips})
    return out
RED,KWHITE,GREENPAINT=27781,32765,4684
def ground_extras(k):
    out=[]
    def edge(side,o): return {'boundary':'road-'+side,'offset':o}
    def band(side,a,b,o0,o1,color=None,curb=False):
        p=pieces(a,b,k)
        if not p: return
        l,r=(edge(side,o0),edge(side,o1)) if side=='right' else (edge(side,-o1),edge(side,-o0))
        if curb: out.append({'kind':'curb','start':pos(k,round(p[0],3)),'end':pos(k,round(p[1],3)),'left':l,'right':r,'stripe':2.5,'colors':[RED,KWHITE]})
        else: out.append({'kind':'strip','start':pos(k,round(p[0],3)),'end':pos(k,round(p[1],3)),'left':l,'right':r,'color':color,'material':None})
    for g in DECOR['green']: band(g['side'],g['from'],g['to'],g['o0'],g['o1'],GREENPAINT)
    for e in E:
        if e['kind']!='arc' or e['radius']>110: continue
        a,b=start[e['id']],start[e['id']]+e['length']; inner=e['turn']; outer='left' if inner=='right' else 'right'
        band(inner,a,b,0,1.2,curb=True)
        if e['id'] not in ('t1-entry','final-entry','s1'): band(outer,b-5,b+35,0,1.2,curb=True)
    return out
def section(k):
    a,b=pos(k,0.0),pos(k,L[k])
    def bd(i,lat): return {'id':i,'knots':[{'at':a,'lateral':lat},{'at':b,'lateral':lat}]}
    def verge(i,road,side):
        kn=[]
        for t,v in verge_profile(side):
            if cuts[k]-1e-9<=t<=cuts[k+1]+1e-9: kn.append((t-cuts[k],v))
        vp=verge_profile(side); xs=[t for t,_ in vp]; vs=[v for _,v in vp]
        kn=[(0.0,float(np.interp(cuts[k],xs,vs)))]+[q for q in kn if 1e-6<q[0]<L[k]-1e-6]+[(L[k],float(np.interp(cuts[k+1],xs,vs)))]
        sign=-1 if side=='left' else 1
        return {'id':i,'knots':[{'at':pos(k,t),'lateral':{'boundary':road,'offset':round(sign*v,3)}} for t,v in kn]}
    B=[verge('verge-left','road-left','left'),bd('road-left',{'lane':'a','side':'left','offset':0}),
       bd('road-right',{'lane':'c','side':'right','offset':0}),verge('verge-right','road-right','right')]
    def st(l,r,color,material): return {'kind':'strip','start':a,'end':b,'left':l,'right':r,'color':color,'material':material}
    ref=lambda i,o=0: {'boundary':i,'offset':o}
    strips=[st(ref('verge-left'),ref('road-left'),None,'GRASS'),st(ref('road-right'),ref('verge-right'),None,'GRASS'),
            st(None,None,GRASS,None),st(ref('road-left'),ref('road-right'),ASPHALT,'ASPHALT'),
            *ground_extras(k),st(ref('road-left'),ref('road-left',0.15),WHITE,None),st(ref('road-right',-0.15),ref('road-right'),WHITE,None)]
    # heading at the Section's start, degrees to the right from the entry frame
    rot=0.0; s=0
    for e in E:
        if s+e['length']<=cuts[k]+1e-9:
            if e['kind']=='arc': rot+=(1 if e['turn']=='right' else -1)*math.degrees(e['length']/e['radius'])
        s+=e['length']
    env=[{'at':a,'name':'TSUKUBA','background':{'image':'hill-sky','horizonY':320,'yawOrigin':round((-rot)%360,6)}}]
    gates=[]
    if k==0:
        gates.append({'kind':'start','grid':[{'at':pos(0,8.0+8.0*(15-i)),'lane':'a' if i%2==0 else 'c'} for i in range(16)]})
        gates.append({'kind':'checkpoint','id':'tsukuba-SECTOR-1','at':b})
    elif k==1: gates.append({'kind':'checkpoint','id':'tsukuba-SECTOR-2','at':b})
    else: gates.append({'kind':'finish','id':'tsukuba-FINISH','at':b})
    return {'id':SID[k],'plan':secs[k],'profile':profiles[k],'lanes':lanes(k),'centerLane':'b','boundaries':B,'strips':strips,
            'walls':walls(k),'openLimits':[],'sprites':sprites(k),'environments':env,'gates':gates}
doc={'format':'superoutride.course','version':48,'name':'TSUKUBA','entry':SID[0],'maxLaps':30,
     'sections':[section(k) for k in range(3)],
     'links':[{'id':'sector-1-to-2','from':{'section':SID[0],'lane':'b'},'to':SID[1]},{'id':'sector-2-to-3','from':{'section':SID[1],'lane':'b'},'to':SID[2]},
              {'id':'sector-3-to-1','from':{'section':SID[2],'lane':'b'},'to':SID[0]}]}
json.dump(doc,open(OUT,'w'))
print('sections',[round(x,3) for x in L],'cuts',[round(c,2) for c in cuts],'pvi',len(pvi),'y range',min(y for _,y in pvi),max(y for _,y in pvi))
