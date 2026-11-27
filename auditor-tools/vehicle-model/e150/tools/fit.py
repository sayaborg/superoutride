"""Ford Econoline E-150 Regular Van 138 in 1983 (US): size the model to Ford's 1983 Econoline catalogue, p. 13. Metres; origin on the road, mid-wheelbase, centre line."""
import sys; sys.path.insert(0,'tools')
import numpy as np
WB=3.5052; LEN=5.2527                              # catalogue: 138 in wheelbase, 206.8 in bumper to bumper (Regular Van)
WF,WR=2.0295,2.0295                               # catalogue: 79.9 in across the body (front view)
RT=0.3593                                         # P225/75R15: 15 in rim + 2 x 0.75 x 225 mm, halved
w=np.load('work/weld.npz'); X=w['X']; Cw=w['Cw']
wh=np.load('work/wheels0.npy',allow_pickle=True).item()
body=(X[:,1]>0.11)&(X[:,1]<0.16)&(np.abs(X[:,0])>0.12)   # the waist of the body sides, below the mirrors and the door handles, above the bumpers
xc=(X[body,0].max()+X[body,0].min())/2
print('centre-line offset of the painted body (model units)',xc)
OAH=2.0574                                        # catalogue: overall height, empty, E-150 138 in: 81.0 in (the roof; the rack is the converter's)
r_,g_,b_=Cw[:,0],Cw[:,1],Cw[:,2]; beige=(r_>150)&(g_>0.68*r_)&(g_<0.92*r_)&(b_>0.35*r_)&(b_<0.68*r_)
roof=X[beige&(np.abs(X[:,0])<0.1),1].max(); sy=OAH/roof   # the height scale is the roof's; the tyres are then made P225/75R15 by the wheel step
rm=np.mean([wh[k][2] for k in ('FL','FR','RL','RR')]); print('height scale %.4f (the tyres alone would give %.4f; the model\'s tyres come out %.4f m in radius before the wheel step)'%(sy,RT/rm,rm*sy))
zf=(wh['FL'][0]+wh['FR'][0])/2; zr=(wh['RL'][0]+wh['RR'][0])/2
# the catalogue's length is bumper to bumper: the bumper guard ahead and the spare tyre and ladder behind are outside it
zrear=X[(X[:,1]>0.03)&(X[:,1]<0.105),2].min(); zfront=X[(X[:,1]>0.03)&(X[:,1]<0.12)&(np.abs(X[:,0])>0.12),2].max()
OF=(LEN-WB)*(zfront-zf)/((zfront-zf)+(zr-zrear)); OR=LEN-WB-OF   # the overhangs keep the model's own share (the catalogue gives none)
print('overhangs taken: front %.4f rear %.4f'%(OF,OR))
hz,t=0.085,0.030; s0=(OF+WB+OR)/(zfront-zrear)
zz=np.linspace(X[:,2].min(),X[:,2].max(),40001); dz=zz[1]-zz[0]
bump=np.zeros_like(zz)
for c in (zf,zr):
    d=np.abs(zz-c); bump=np.maximum(bump,np.where(d<=hz,1.0,np.where(d>=hz+t,0.0,0.5+0.5*np.cos(np.pi*(d-hz)/t))))
mid=(zz>zr)&(zz<zf); fr=(zz>=zf)&(zz<=zfront); rr=(zz<=zr)&(zz>=zrear)
sm=(WB-s0*bump[mid].sum()*dz)/((1-bump[mid]).sum()*dz)
sf=(OF-s0*bump[fr].sum()*dz)/((1-bump[fr]).sum()*dz)
sr=(OR-s0*bump[rr].sum()*dz)/((1-bump[rr]).sum()*dz)
slope=s0*bump+np.where(mid,sm,np.where(zz>=zf,sf,sr))*(1-bump)
f=np.concatenate([[0],np.cumsum((slope[1:]+slope[:-1])/2)*dz]); fz=lambda z: np.interp(z,zz,f)
m0=(fz(zf)+fz(zr))/2; zq=fz(X[:,2])-m0; zF=fz(zf)-m0; zR=fz(zr)-m0
hF=np.abs(X[body&(np.abs(zq-zF)<0.3),0]-xc).max(); hR=np.abs(X[body&(np.abs(zq-zR)<0.3),0]-xc).max()
sxF=sxR=(WF/2)/np.abs(X[body,0]-xc).max()   # one width scale for the whole car: its widest point at the molding's belt is 1,725 mm
sxv=sxR+(sxF-sxR)*np.clip((zq-zR)/(zF-zR),0,1)
Q=np.stack([(X[:,0]-xc)*sxv,X[:,1]*sy,zq],1); sx=(sxF+sxR)/2
print('scales: x front axle %.4f rear axle %.4f | y %.4f | z wheel zones %.4f, between axles %.4f, front overhang %.4f, rear overhang %.4f'%(sxF,sxR,sy,s0,sm,sf,sr))
np.save('work/X1.npy',Q); np.save('work/body.npy',body); np.save('work/sxv.npy',sxv)
np.save('work/fitinfo.npy',dict(sxF=sxF,sxR=sxR,s0=s0,sx=sx,sy=sy,sm=sm,so=sf,sr=sr,zf=zF,zr=zR,xc=xc),allow_pickle=True)
print('measured: length %.4f | height %.4f | width overall (mirrors) %.4f'%(Q[:,2].max()-Q[:,2].min(),Q[:,1].max(),Q[:,0].max()-Q[:,0].min()))
b=body
for nm,m in (('front fenders',Q[:,2]>1.0),('doors',(Q[:,2]>-0.5)&(Q[:,2]<0.6)),('rear fenders',Q[:,2]<-1.0),('all',Q[:,2]>-9)):
    print('  painted width at',nm,'%.4f'%(Q[b&m,0].max()-Q[b&m,0].min()))
print('axles z: front %.4f rear %.4f wheelbase %.4f | front overhang %.4f | rear overhang %.4f'%(zF,zR,zF-zR,Q[:,2].max()-zF,zR-Q[:,2].min()))
for k,v in wh.items(): print(k,'wheel after fit: centre y %.4f r(y) %.4f r(z) %.4f  tread centre x %.4f'%(v[1]*sy,v[2]*sy,v[2]*s0,(v[3]+v[4])/2*(sxF if k[0]=='F' else sxR)))
