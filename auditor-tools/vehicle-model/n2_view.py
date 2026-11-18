import sys,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend
p=sys.argv[1]; cache=sys.argv[2]; out=sys.argv[3]
pts,uv,nn=rend.geom(p,cache,4_000_000); T=rend.base_tex(p); print('tex',T.shape)
col=rend.colors(T,uv); np.savez(cache.replace('.npz','_col.npz'),pts=pts,col=col.astype(np.uint8))
m=np.abs(pts).max(0); print('ext',pts.min(0),pts.max(0))
L=max(m[2],m[0])*1.08; H=pts[:,1].max()*1.06
box={'left':(-L,L,-0.02*H,H),'right':(-L,L,-0.02*H,H),'rear':(-L*0.5,L*0.5,-0.02*H,H),'front':(-L*0.5,L*0.5,-0.02*H,H),'top':(-L,L,-L*0.5,L*0.5),'ql':(-L,L,-0.02*H,H),'rl':(-L,L,-0.02*H,H)}
sc=float(sys.argv[4]) if len(sys.argv)>4 else 900
print(rend.sheet(pts,nn,[col],['shaded'],['left','right','front','rear','top','ql'],sc,box,out,shade=True))
