import sys,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend
L=np.load(sys.argv[1]); geom=sys.argv[2]; out=sys.argv[3]; sc=float(sys.argv[4]) if len(sys.argv)>4 else 420
d=np.load(geom); pts,uv,nn=d['pts'],d['uv'],d['nn']
C=np.array([[60,60,60],[215,5,17],[32,46,131],[235,235,233],[0,0,0],[0,0,0],[255,0,255]],np.uint8)
col=rend.colors(C[L],uv); views=sys.argv[5].split(',') if len(sys.argv)>5 else ['left','right','rear','top']
m=np.abs(pts).max(0); Lx=1.1; H=1.42
box={'left':(-Lx,Lx,-0.03,H),'right':(-Lx,Lx,-0.03,H),'rear':(-0.55,0.55,-0.03,H),'front':(-0.55,0.55,-0.03,H),'top':(-Lx,Lx,-0.55,0.55),'ql':(-Lx,Lx,-0.03,H),'rl':(-Lx,Lx,-0.03,H),'qr':(-Lx,Lx,-0.03,H)}
print(rend.sheet(pts,nn,[col],['labels'],views,sc,box,out,shade=False))
