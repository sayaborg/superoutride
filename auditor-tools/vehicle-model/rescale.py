import sys, json, struct, hashlib, numpy as np
src,pts,dst,WB=sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4])
d=np.load(pts); P=d['pts'].astype(float); lum=d['col'].astype(float).mean(1)
def fit(s):
    m=(np.abs(P[:,0])<0.012)&(lum<80)&(P[:,2]*s>0.2)&(P[:,1]<0.30)
    q=P[m][:,[2,1]]; c=np.array([0.34*s,0.15]); R=0.15
    for it in range(40):
        v=q-c; ang=np.degrees(np.arctan2(v[:,1],v[:,0]*s)); r=np.hypot(*v.T)
        sel=(ang>-150)&(ang<25); bins=np.floor(ang[sel]+150).astype(int); qs=q[sel]; rs=r[sel]
        e=np.array([qs[bins==b][np.argmax(rs[bins==b])] for b in np.unique(bins) if (bins==b).sum()>8])
        for k in range(5):
            A=np.c_[2*e,np.ones(len(e))]; sol=np.linalg.lstsq(A,(e**2).sum(1),rcond=None)[0]
            c=sol[:2]; R=np.sqrt(sol[2]+c@c); res=np.abs(np.hypot(*(e-c).T)-R)
            keep=res<max(0.002,2.5*np.median(res))
            if keep.all(): break
            e=e[keep]
    return c,R,res.mean(),len(e)
(fc,fR,fr,fn),(rc,rR,rr,rn)=fit(1),fit(-1)
print('front',fc,fR,fr,fn); print('rear',rc,rR,rr,rn)
wb=fc[0]-rc[0]; s=WB/wb; zmid=(fc[0]+rc[0])/2; print('wb units',wb,'scale',s,'zmid',zmid)
b=bytearray(open(src,'rb').read())
jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(bytes(b[20:20+jl])); bin0=20+jl+8
pr=j['meshes'][0]['primitives'][0]; a=j['accessors'][pr['attributes']['POSITION']]; v=j['bufferViews'][a['bufferView']]
assert a['componentType']==5126 and v.get('byteStride',12)==12
o=bin0+v.get('byteOffset',0)+a.get('byteOffset',0)
X=np.frombuffer(bytes(b[o:o+a['count']*12]),np.float32).reshape(-1,3).astype(np.float64)
X[:,2]-=zmid; X[:,1]-=X[:,1].min(); X*=s
X=X.astype(np.float32); b[o:o+a['count']*12]=X.tobytes()
a['min']=[float(x) for x in X.min(0)]; a['max']=[float(x) for x in X.max(0)]
j['nodes'][0]['name']='Honda_NSR500_1984'
r=lambda x:round(float(x),4)
j['nodes'][0]['extras']={'units':'m','axes':'front +Z, up +Y, left +X','origin':'ground, mid wheelbase, centerline',
 'wheelbase':WB,'scale_applied':float(s),
 'wheel_F':{'center':[0,r((fc[1])*s),r((fc[0]-zmid)*s)],'radius':r(fR*s)},
 'wheel_R':{'center':[0,r((rc[1])*s),r((rc[0]-zmid)*s)],'radius':r(rR*s)},
 'note':'bike and rider are one mesh; rescaled and re-origined only'}
js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
binchunk=bytes(b[20+jl:])
out=b'glTF'+struct.pack('<II',2,12+8+len(js)+len(binchunk))+struct.pack('<II',len(js),0x4E4F534A)+js+binchunk
open(dst,'wb').write(out)
print(json.dumps(j['nodes'][0],indent=1)); print('bbox',a['min'],a['max'])
print('sha256',hashlib.sha256(out).hexdigest(),len(out))
# extra dims
Xs=X.astype(float)
print('L',Xs[:,2].max()-Xs[:,2].min(),'W',Xs[:,0].max()-Xs[:,0].min(),'H',Xs[:,1].max())
