"""Reshape the tires (and rim size) of a GLB whose wheels are fused into one mesh.
usage: retire.py in.glb out.glb targets.json
The GLB must already be in metres, front +Z, up +Y, with node extras wheel_* = {center:[x,y,z], radius}.
targets.json: {"wheel_F": {"radius":..,"half_width":..,"rim_radius":..}, ...}
Each wheel is treated as a solid of revolution: its profile (half width by radius) is read from the
unobstructed lower sector, vertices inside that profile are remapped radially and across, everything else is left.
Afterwards the whole model is pitched and lowered so that every tire touches y=0 again."""
import sys, json, hashlib, numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import glbio
src,dst,tj=sys.argv[1:4]; T=json.load(open(tj))
b,j,jl=glbio.load(src); pr=j['meshes'][0]['primitives'][0]
P=glbio.get(b,j,jl,pr['attributes']['POSITION']).astype(np.float64); N=glbio.get(b,j,jl,pr['attributes']['NORMAL']).astype(np.float64)
ex=j['nodes'][0]['extras']; BIN=0.002; TOL=0.002; rep={}
for name,t in T.items():
    c=np.array(ex[name]['center'],float); Rm=ex[name]['radius']
    dx=P[:,0]-c[0]; dy=P[:,1]-c[1]; dz=P[:,2]-c[2]; r=np.hypot(dy,dz); ang=np.degrees(np.arctan2(dz,-dy))
    low=(np.abs(ang)<50)&(np.abs(dx)<0.25)&(r<Rm+0.004)
    nb=int((Rm+0.004)/BIN)+1; prof=np.zeros(nb); bi=np.minimum((r/BIN).astype(int),nb-1)
    for k in np.unique(bi[low]):
        m=low&(bi==k)
        if m.sum()>=5: prof[k]=np.percentile(np.abs(dx[m]),99.5)
    # refine model radius and rim edge from the profile
    Rm=float(r[low].max())
    hw_m=float(prof[int(0.20/BIN):].max())
    rim_m=t['model_rim_radius']; ra=t['inner_radius']
    env=np.maximum.reduce([prof,np.r_[prof[1:],0],np.r_[0,prof[:-1]]])+TOL
    sel=(r>=ra)&(r<=Rm+TOL)&(np.abs(dx)<=env[bi])
    Rt,rim_t,hw_t=t['radius'],t['rim_radius'],t['half_width']; kw=hw_t/hw_m
    rs=r[sel]
    rn=np.interp(rs,[ra,rim_m,Rm,Rm+TOL],[ra,rim_t,Rt,Rt+TOL])
    slope=np.where(rs<rim_m,(rim_t-ra)/(rim_m-ra),(Rt-rim_t)/(Rm-rim_m))
    kx=np.interp(rs,[ra,rim_m],[1.0,kw])
    er=np.c_[dy[sel],dz[sel]]/np.maximum(rs,1e-9)[:,None]            # radial unit (y,z)
    P[sel,0]=c[0]+dx[sel]*kx; P[sel,1]=c[1]+er[:,0]*rn; P[sel,2]=c[2]+er[:,1]*rn
    n=N[sel]; nr=n[:,1]*er[:,0]+n[:,2]*er[:,1]; nt=-n[:,1]*er[:,1]+n[:,2]*er[:,0]
    nx=n[:,0]/kx; nr2=nr/slope; nt2=nt/(rn/np.maximum(rs,1e-9))
    n2=np.c_[nx,nr2*er[:,0]-nt2*er[:,1],nr2*er[:,1]+nt2*er[:,0]]; n2/=np.linalg.norm(n2,axis=1,keepdims=True)+1e-12; N[sel]=n2
    rep[name]=dict(model_radius=Rm,model_half_width=hw_m,selected=int(sel.sum()),kw=kw,center=c.tolist(),Rt=Rt)
    print(name,rep[name])
# put every tire back on the ground: least-squares pitch about X + lift (exact for two axles)
cz=np.array([v['center'][2] for v in rep.values()]); by=np.array([v['center'][1]-v['Rt'] for v in rep.values()])
A=np.c_[cz,np.ones(len(cz))]; (a,b0),*_=np.linalg.lstsq(A,by,rcond=None); th=np.arctan(a)
print('pitch deg',np.degrees(th),'lift',-b0)
cs,sn=np.cos(th),np.sin(th)
def rot(V): y=V[:,1]*cs-V[:,2]*sn; z=V[:,1]*sn+V[:,2]*cs; return np.c_[V[:,0],y,z]
P[:,1]-=b0; P=rot(P); N=rot(N)
newc={}
for name,v in rep.items():
    cc=np.array([v['center']],float); cc[:,1]-=b0; newc[name]=rot(cc)[0]
zs=[c[2] for c in newc.values()]; zmid=(max(zs)+min(zs))/2; P[:,2]-=zmid
for name in rep:
    c=newc[name]; c[2]-=zmid; t=T[name]
    ex[name]={'center':[round(float(x),4) for x in c],'radius':t['radius'],'width':round(2*t['half_width'],4),'rim_radius':t['rim_radius']}
ex['wheelbase']=round(max(zs)-min(zs),4); ex['note']=ex.get('note','')+'; tires reshaped to real sizes'
P32=P.astype(np.float32); glbio.put(b,j,jl,pr['attributes']['POSITION'],P32); glbio.put(b,j,jl,pr['attributes']['NORMAL'],N)
a=j['accessors'][pr['attributes']['POSITION']]; a['min']=[float(x) for x in P32.min(0)]; a['max']=[float(x) for x in P32.max(0)]
out=glbio.save(dst,b,j,jl); print(json.dumps(ex,indent=1)); print('bbox',a['min'],a['max']); print('sha256',hashlib.sha256(out).hexdigest())
