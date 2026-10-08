import cutlib
from cutlib import *
cutlib.VSRC='v3'
P=lambda *a:[list(a)]
cut('12.6',(753,344,1447,381),'tsukuba-gantry',24.0,pts=P((0,0),(694,0),(694,37),(0,37)),keepblue=P((0,0),(694,0),(694,37),(0,37)))
cut('12.6',(300,173,813,520),'tsukuba-stand',26.0,cloud=True)
cut('12.6',(1427,213,1667,527),'tsukuba-tower',10.5,pts=P((8,35),(218,22),(222,100),(240,110),(240,314),(0,314),(0,110),(12,100)),keepblue=P((0,0),(240,0),(240,314),(0,314)))
cut('11.5',(1447,295,1920,518),'tsukuba-pit',30.0,pts=P((0,150),(473,0),(473,223),(0,223)),keepblue=P((0,0),(473,0),(473,223),(0,223)))
cut('13.9',(360,253,840,520),'tsukuba-stand-b',30.0,cloud=True)
cut('20.1',(333,395,640,492),'board-yokohama',7.0,pts=P((0,0),(307,22),(307,97),(0,90)),keepblue=P((0,0),(307,0),(307,97),(0,97)))
cut('20.1',(1047,449,1193,490),'board-advan',7.0,pts=P((0,0),(146,0),(146,41),(0,41)),keepblue=P((0,0),(146,0),(146,41),(0,41)))
cut('36.3',(1171,345,1455,470),'board-matsunaga',9.0,pts=P((0,22),(284,0),(284,112),(0,125)),keepblue=P((0,0),(284,0),(284,125),(0,125)))
cut('36.3',(811,393,1037,467),'board-blank',7.0,pts=P((0,0),(226,0),(226,74),(0,74)),keepblue=P((0,0),(226,0),(226,74),(0,74)))
cut('54.7',(467,270,935,400),'trees-b',44.0,cloud=True)
cut('16.0',(200,335,560,500),'tsukuba-house',22.0,cloud=True)
cut('16.0',(1507,340,1920,540),'tsukuba-gas',28.0,pts=P((0,60),(413,0),(413,200),(0,200)),keepblue=P((0,0),(413,0),(413,200),(0,200)))
cut('75.0',(53,407,433,493),'board-wakos',20.0,pts=P((0,0),(380,22),(380,86),(0,86)),keepblue=P((0,0),(380,0),(380,86),(0,86)))
cut_dark('46.5',(840,350,895,527),'pylon',14.0,vmax=150,close=0)
cut_dark('46.5',(1250,370,1325,502),'lamp',4.0,vmax=120,close=0)
# the tyre-shaped Dunlop arch
x0,y0,x1,y1=940,255,1600,530; c=frame('43.0')[y0:y1,x0:x1].copy(); hsv=cv2.cvtColor(c,cv2.COLOR_BGR2HSV); h,s,v=[hsv[...,i].astype(int) for i in range(3)]
dark=(v<95).astype(np.uint8); dark[240:,180:540]=0; body=largest(cv2.morphologyEx(dark,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8)))
# fill the lettering: holes of the body that do not touch the crop's border
inv=(1-body).astype(np.uint8); n,lab,st,_=cv2.connectedComponentsWithStats(inv,connectivity=4); m=body.copy()
for i in range(1,n):
    x,y,w,hh,a=st[i]
    if x>0 and y>0 and x+w<inv.shape[1] and y+hh<inv.shape[0] and a<6000: m[lab==i]=1
yellow=((h>18)&(h<36)&(s>110)&(v>130)).astype(np.uint8); yellow[150:,:]=0; yellow[:,:150]=0; yellow[:,520:]=0
m=largest(cv2.morphologyEx((m|yellow),cv2.MORPH_CLOSE,np.ones((5,5),np.uint8)))
ys,xs=np.where(m); X0,X1,Y0,Y1=xs.min(),xs.max(),ys.min(),ys.max()
save_rgba(c[Y0:Y1+1,X0:X1+1].copy(),m[Y0:Y1+1,X0:X1+1],S+'spr/dunlop-arch.png'); publish('dunlop-arch',c[Y0:Y1+1,X0:X1+1].copy(),m[Y0:Y1+1,X0:X1+1],30.0)
