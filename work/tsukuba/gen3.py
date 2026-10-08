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
# ---- appearance ---------------------------------------------------------------
import os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import decor as D
def c5(r,g,b): return (r<<10)|(g<<5)|b
def zone_value(zones,side,t,default):
    for z in zones:
        if z[0]!=side: continue
        a,b=z[1],z[2]
        if (a<=t<b) if a<b else (t>=a or t<b): return z[3]
    return default
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
    sign=1 if side=='right' else -1; out=[]
    sec=np.searchsorted(cuts,CL[:,0],side='right')-1
    for i,(si,xi,zi,hi,ci) in enumerate(CL):
        n=np.array([math.cos(hi),-math.sin(hi)])*sign
        lim=60.0
        m=(sec==sec[i])&(np.abs(CL[:,0]-si)>60.0)
        d=CL[m,1:3]-[xi,zi]; proj=d@n; dist2=(d**2).sum(1)
        ok=proj>0.3*np.sqrt(dist2)
        if ok.any(): lim=min(lim,float((dist2[ok]/(2*proj[ok])).min())-REACH-MARGIN)
        if ci*sign>0: lim=min(lim,1/abs(ci)-10.0)
        out.append(lim)
    out=np.array(out); w=5
    return np.array([out[max(0,i-w):i+w+1].min() for i in range(len(out))])
ROOM={side:room(side) for side in ('left','right')}
JT=sorted(set([0.0]+[start[e['id']] for e in E]+cuts[1:3]))
ST=sorted(JT+[float(t) for t in np.arange(10.0,TOT,10.0) if min(abs(t-j) for j in JT+[TOT])>4.0])
def verge_profile(side):
    ev=[]
    for t in ST:
        i=int(np.argmin(np.abs(CL[:,0]-t)))
        v=min(zone_value(D.VERGE,side,t,D.VERGE_DEFAULT),ROOM[side][i]-width(t)/2)
        ev.append((float(t),round(max(1.0,float(v)),1)))
    ev.append((TOT,ev[0][1]))
    keep=[ev[0]]
    for p,q,r in zip(ev,ev[1:],ev[2:]):
        if abs((q[1]-p[1])/(q[0]-p[0])-(r[1]-q[1])/(r[0]-q[0]))>1e-9: keep.append(q)
    keep.append(ev[-1]); return keep
VP={side:verge_profile(side) for side in ('left','right')}
def racing_line():
    """A plausible driven line as a lateral along the lap: toward the inside through each corner, eased over 50 m."""
    raw=[]
    for t in ST+[TOT]:
        i=int(np.argmin(np.abs(CL[:,0]-(t%TOT)))); c=CL[i,4]
        raw.append((1 if c>0 else -1)*(width(t)/2-2.0) if abs(c)>1/200 else 0.0)
    xs=np.array(ST+[TOT]); raw=np.array(raw); out=[]
    for t in xs:
        d=np.minimum(np.abs(xs-t),TOT-np.abs(xs-t)); w=np.clip(1-d/50.0,0,None); out.append(float((raw*w).sum()/w.sum()))
    out[-1]=out[0]
    return list(zip(xs.tolist(),[round(v,2) for v in out]))
RL=racing_line()
def pieces(a,b,k):
    lo,hi=max(a,cuts[k]),min(b,cuts[k+1])
    return (round(lo-cuts[k],3),min(round(hi-cuts[k],3),L[k])) if hi-lo>0.5 else None
def spans(a,b):
    return [(a,b)] if a<b else [(a,TOT),(0.0,b)]
def lat(v):
    if isinstance(v,dict):
        if 'verge' in v: return {'boundary':'verge-'+v['verge'],'offset':v.get('offset',0)}
        if 'road' in v: return {'boundary':'road-'+v['road'],'offset':v.get('offset',0)}
    return v
def sprites(k):
    out=[]
    for d in D.SPRITES:
        if not (cuts[k]<=d['s']<cuts[k+1]): continue
        sp={'kind':'sprite','image':d['image'],'palette':'original','at':pos(k,round(d['s']-cuts[k],3)),'lateral':lat(d['l']),
            'groundOffset':d.get('up',0),'unselectedLink':None,'body':None}
        if 'count' in d:
            n=min(d['count'],int((cuts[k+1]-0.01-d['s'])//d['every'])+1)
            sp={'kind':'repeat','every':d['every'],'count':n,'elements':[sp]} if n>=2 else sp
        out.append(sp)
    return out
def wall_strips(kind,p0,p1,k):
    out=[]
    def band(col,bot,top): out.append({'kind':'strip','color':col,'knots':[{'at':pos(k,p0),'bottom':bot,'top':top},{'at':pos(k,p1),'bottom':bot,'top':top}]})
    def posts(col,every,w,bot,top,phase=0.0):
        n=int((p1-p0-w-phase)//every)+1
        if n<1: return
        st={'kind':'strip','color':col,'knots':[{'at':pos(k,round(p0+phase,3)),'bottom':bot,'top':top},{'at':pos(k,round(p0+phase+w,3)),'bottom':bot,'top':top}]}
        out.append({'kind':'repeat','every':every,'count':n,'elements':[st]} if n>=2 else st)
    for op in D.WALL_KINDS[kind]:
        if op[0]=='band': band(*op[1:])
        else: posts(*op[1:])
    return out
def walls(k):
    out=[]
    for side in ('left','right'):
        for line in ('verge','back','far'):
            strips=[]
            for z in D.WALLS:
                if z[0]!=side or z[1]!=line: continue
                for a,b in spans(z[2],z[3]):
                    p=pieces(a,b,k)
                    if p: strips+=wall_strips(z[4],p[0],p[1],k)
            if strips: out.append({'boundary':line+'-'+side,'start':pos(k,0.0),'end':pos(k,L[k]),'solid':None,'strips':strips})
    return out
def ground_extras(k):
    out=[]
    def edge(side,o): return {'boundary':'road-'+side,'offset':o}
    def band(side,a,b,o0,o1,color=None,curb=False):
        for a2,b2 in spans(a,b):
            p=pieces(a2,b2,k)
            if not p: continue
            l,r=(edge(side,o0),edge(side,o1)) if side=='right' else (edge(side,-o1),edge(side,-o0))
            if curb: out.append({'kind':'curb','start':pos(k,p[0]),'end':pos(k,p[1]),'left':l,'right':r,'stripe':D.KERB_STRIPE,'colors':list(D.KERB)})
            else: out.append({'kind':'strip','start':pos(k,p[0]),'end':pos(k,p[1]),'left':l,'right':r,'color':color,'material':None})
    for side,a,b,o0,o1,col in D.PAINT: band(side,a,b,o0,o1,col)
    for e in E:
        if e['kind']!='arc' or e['radius']>110: continue
        a,b=start[e['id']],start[e['id']]+e['length']; inner=e['turn']; outer='left' if inner=='right' else 'right'
        band(inner,a,b,0,D.KERB_WIDTH,curb=True)
        if e['id'] not in ('t1-entry','final-entry','s1'): band(outer,b-5,b+35,0,D.KERB_WIDTH,curb=True)
    for side,a,b in D.EXTRA_KERBS: band(side,a,b,0,D.KERB_WIDTH,curb=True)
    return out
def rep(k,every,length,phase,l,r,color):
    """Color-only Strips of one length repeated along the whole Section."""
    n=int((L[k]-phase-length)//every)+1
    st={'kind':'strip','start':pos(k,phase),'end':pos(k,phase+length),'left':l,'right':r,'color':color,'material':None}
    return {'kind':'repeat','every':every,'count':n,'elements':[st]} if n>=2 else st
def section(k):
    a,b=pos(k,0.0),pos(k,L[k])
    def bd(i,lt): return {'id':i,'knots':[{'at':a,'lateral':lt},{'at':b,'lateral':lt}]}
    def verge(i,road,side):
        vp=VP[side]; xs=[t for t,_ in vp]; vs=[v for _,v in vp]
        kn=[(0.0,float(np.interp(cuts[k],xs,vs)))]+[(t-cuts[k],v) for t,v in vp if cuts[k]+1e-6<t<cuts[k+1]-1e-6]+[(L[k],float(np.interp(cuts[k+1],xs,vs)))]
        sign=-1 if side=='left' else 1
        return {'id':i,'knots':[{'at':pos(k,t),'lateral':{'boundary':road,'offset':round(sign*v,3)}} for t,v in kn]}
    xs=[t for t,_ in RL]; vs=[v for _,v in RL]
    rl=[(0.0,float(np.interp(cuts[k],xs,vs)))]+[(t-cuts[k],v) for t,v in RL if cuts[k]+1e-6<t<cuts[k+1]-1e-6]+[(L[k],float(np.interp(cuts[k+1] if k<2 else 0.0,xs,vs)))]
    B=[verge('verge-left','road-left','left'),bd('road-left',{'lane':'a','side':'left','offset':0}),
       bd('road-right',{'lane':'c','side':'right','offset':0}),verge('verge-right','road-right','right'),
       bd('back-left',{'boundary':'verge-left','offset':-D.BACK}),bd('back-right',{'boundary':'verge-right','offset':D.BACK}),
       bd('far-left',{'boundary':'verge-left','offset':-D.FAR}),bd('far-right',{'boundary':'verge-right','offset':D.FAR}),
       {'id':'line','knots':[{'at':pos(k,t),'lateral':round(v,2)} for t,v in rl]}]
    def st(l,r,color,material,s0=None,s1=None): return {'kind':'strip','start':s0 or a,'end':s1 or b,'left':l,'right':r,'color':color,'material':material}
    ref=lambda i,o=0: {'boundary':i,'offset':o}
    rl_,rr_=ref('road-left'),ref('road-right')
    strips=[st(ref('verge-left'),rl_,None,'GRASS'),st(rr_,ref('verge-right'),None,'GRASS'),
            st(None,None,D.GRASS[0],None),rep(k,D.GRASS_EVERY,D.GRASS_EVERY/2,0.0,None,None,D.GRASS[1]),
            st(rl_,rr_,D.ASPHALT[0],'ASPHALT')]
    for every,length,phase,col in D.ASPHALT_BANDS: strips.append(rep(k,every,length,phase,rl_,rr_,col))
    for (a0,b0,l0,l1,col) in D.PATCHES:
        p=pieces(a0,b0,k)
        if p: strips.append(st(l0 if not isinstance(l0,dict) else lat(l0),l1 if not isinstance(l1,dict) else lat(l1),col,None,pos(k,p[0]),pos(k,p[1])))
    for o in (-D.TRACK/2,D.TRACK/2): strips.append(st(ref('line',o-D.RUBBER/2),ref('line',o+D.RUBBER/2),D.ASPHALT[1],None))
    strips+=ground_extras(k)
    strips+=[st(rl_,ref('road-left',0.15),D.LINE,None),st(ref('road-right',-0.15),rr_,D.LINE,None)]
    if k==0:
        strips.append(st(rl_,rr_,D.LINE,None,pos(0,0.0),pos(0,0.4)))
        for i in range(16):
            sg=8.0+8.0*(15-i)+2.4; lane='a' if i%2==0 else 'c'
            strips.append(st({'lane':lane,'side':'center','offset':-1.1},{'lane':lane,'side':'center','offset':1.1},D.LINE,None,pos(0,sg),pos(0,sg+0.15)))
    rot=0.0; s=0
    for e in E:
        if s+e['length']<=cuts[k]+1e-9:
            if e['kind']=='arc': rot+=(1 if e['turn']=='right' else -1)*math.degrees(e['length']/e['radius'])
        s+=e['length']
    env=[{'at':a,'name':'TSUKUBA','background':{'image':D.SKY,'horizonY':320,'yawOrigin':round((D.SKY_YAW-rot)%360,6)}}]
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
print('ok')
