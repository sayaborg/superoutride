"""What stands beside Tsukuba's road, by lap station (m from the control line). Read by gen3.py."""
def c5(r,g,b): return (r<<10)|(g<<5)|b
TOT=2044.96
# ---- ground -------------------------------------------------------------------
GRASS=(c5(12,18,7),c5(13,19,8)); GRASS_EVERY=8.0
ASPHALT=(c5(13,13,14),c5(12,12,13),c5(12,12,13))        # road, driven line, darker marks on the line
ASPHALT_BANDS=[(29.0,6.0,11.0,c5(12,13,14)),(7.0,0.4,5.0,c5(12,12,13))]   # every, length, phase, color
RUBBER=0.5; TRACK=1.6
LINE=c5(31,31,30)
KERB=(c5(27,5,5),c5(31,31,30)); KERB_STRIPE=2.0; KERB_WIDTH=1.3
GREEN=c5(5,17,12); TARMAC=c5(17,17,17); SAND=c5(22,19,13)
PAINT=[  # side, from, to, offset from the road edge (inner, outer), color
 ('left',1950,75,0,4.5,GREEN),
 ('left',586.6,680.1,1.3,4.5,GREEN),('right',1176.5,1251.3,1.3,4.5,GREEN),('right',1854,1953,1.3,4.5,GREEN),
 ('left',186,330,1.3,14,TARMAC),          # first corner's outer run-off is paved
 ('right',590,700,1.3,9,SAND),            # first hairpin's outer gravel
 ('left',1176,1300,1.3,9,SAND),           # second hairpin's outer gravel
 ('left',1700,1955,1.3,9,SAND),           # final corner's outer gravel
]
PATCHES=[]   # from, to, left, right, color
EXTRA_KERBS=[('left',150,190),('right',1920,1960)]
# ---- verges and walls -----------------------------------------------------------
VERGE_DEFAULT=10.0
VERGE=[  # side, from, to, width from the road edge to the barrier
 ('right',1950,150,3.0),('right',150,190,6.0),('left',1940,170,9.0),('left',170,330,15.0),('right',190,306,6.0),
 ('left',306,590,8.0),('right',306,590,8.0),('right',590,700,12.0),('left',690,800,6.0),('right',700,800,8.0),
 ('left',800,900,10.0),('right',800,900,5.0),('left',900,1150,8.0),('right',900,1180,9.0),('left',1150,1300,17.0),
 ('left',1300,1700,4.0),('right',1290,1700,10.0),('left',1700,1940,12.0),('right',1700,1950,6.0)]
BACK=1.2; FAR=14.0
W_=c5(30,30,29); WS=c5(24,24,25); BLUE=c5(5,11,24); ORANGE=c5(16,11,7); ORANGE_D=c5(11,8,5); GREY=c5(18,18,19); DGREY=c5(9,9,10)
FGREY=c5(10,11,13); YELLOW=c5(30,25,3); BLACK=c5(3,3,4); NOISE=c5(19,19,18); NOISE_D=c5(15,15,15); RAIL=c5(27,27,28); GREENF=c5(8,15,10)
WALL_KINDS={
 'white':[('band',W_,0,1.0),('posts',WS,2.5,0.06,0,1.0,0.0)],
 'banner':[('band',W_,0,1.1),('band',BLUE,0.45,0.95),('posts',W_,3.2,1.0,0.45,0.95,0.4),('posts',WS,3.2,0.06,0,1.1,0.0)],
 'pitboards':[('band',W_,0,1.1),('posts',BLACK,7.0,4.2,0.3,0.85,1.0),('posts',W_,7.0,3.6,0.45,0.7,1.3)],
 'pit':[('band',W_,0,1.0),('band',BLUE,0.3,0.9),('posts',W_,4.0,1.6,0.3,0.9,1.0)],
 'orange':[('band',ORANGE,0,1.1),('posts',ORANGE_D,1.5,0.08,0,1.1,0.0),('band',ORANGE_D,1.02,1.1)],
 'yellow':[('band',YELLOW,0,1.2),('posts',BLACK,5.0,2.4,0.35,0.85,1.2)],
 'cover':[('band',GREY,0,1.3),('posts',DGREY,3.0,0.1,0,1.3,0.0)],
 'board':[('band',BLACK,1.3,3.3)],
 'guardrail':[('band',RAIL,0.25,0.5),('band',RAIL,0.65,0.9),('posts',GREY,4.0,0.12,0,0.95,0.0)],
 'fence':[('band',FGREY,3.3,3.45),('band',FGREY,2.5,2.6),('band',FGREY,1.7,1.8),('band',FGREY,0.9,1.0),('posts',DGREY,5.0,0.3,0,3.9,0.0)],
 'fence-tall':[('band',FGREY,4.6,4.75),('band',FGREY,3.7,3.8),('band',FGREY,2.8,2.9),('band',FGREY,1.9,2.0),('band',FGREY,1.0,1.1),('posts',DGREY,6.0,0.35,0,5.4,0.0)],
 'fence-green':[('band',GREENF,0,1.6),('posts',DGREY,3.0,0.1,0,1.7,0.0)],
 'noise':[('band',NOISE,0,4.2),('posts',NOISE_D,4.0,0.2,0,4.2,0.0),('band',NOISE_D,4.0,4.2),('band',NOISE_D,2.0,2.1)],
 'tyres':[('band',DGREY,0,0.9),('posts',BLACK,0.6,0.1,0,0.9,0.0)],
}
WALLS=[  # side, line, from, to, kind
 ('right','verge',1950,25,'pit'),('right','verge',25,150,'pitboards'),('right','verge',150,590,'guardrail'),('right','verge',590,700,'banner'),
 ('right','verge',700,860,'orange'),('right','verge',860,1010,'banner'),('right','verge',1010,1180,'orange'),('right','verge',1180,1950,'guardrail'),
 ('left','verge',1940,170,'banner'),('left','verge',170,290,'cover'),('left','verge',170,290,'board'),('left','verge',290,420,'banner'),('left','verge',420,590,'guardrail'),
 ('left','verge',590,690,'guardrail'),('left','verge',690,800,'orange'),('left','verge',800,900,'yellow'),
 ('left','verge',900,1150,'orange'),('left','verge',1150,1300,'white'),('left','verge',1300,1700,'guardrail'),('left','verge',1700,1940,'white'),
 ('left','back',1940,330,'fence'),('right','back',590,700,'fence'),('left','back',800,1150,'fence'),
 ('left','back',1170,1310,'noise'),('left','back',1310,1700,'fence-tall'),('right','back',1290,1700,'fence'),('left','back',1700,1940,'fence'),
 ('right','back',150,190,'fence'),
]
# ---- sprites -----------------------------------------------------------------
SKY='tsukuba-sky'; SKY_YAW=0.0
def V(side,o=0): return {'verge':side,'offset':o}
def R(side,o=0): return {'road':side,'offset':o}
SPRITES=[
 {'image':'dunlop-arch','s':860.0,'l':-2.0},
 {'image':'dunlop-stand','s':885.0,'l':V('right',26)},
 {'image':'infield-buildings','s':770.0,'l':V('left',-34)},
 {'image':'tsukuba-gantry','s':2043.5,'l':0.0,'up':5.2},
 {'image':'tsukuba-screen','s':1995.0,'l':V('left',-6),'up':2.5},
 {'image':'tsukuba-stand','s':14.0,'l':V('left',-9)},
 {'image':'tsukuba-stand-b','s':100.0,'l':V('left',-9)},
 {'image':'tsukuba-pit','s':1930.0,'l':R('right',17),'every':30.0,'count':3},
 {'image':'tsukuba-tower','s':2036.0,'l':R('right',11)},
 {'image':'tsukuba-pit','s':28.0,'l':R('right',17),'every':30.0,'count':4},
 {'image':'tsukuba-signal','s':68.0,'l':V('right',2)},
 {'image':'tsukuba-house','s':150.0,'l':V('left',-20)},
 {'image':'tsukuba-gas','s':215.0,'l':R('right',48)},
 {'image':'board-yokohama','s':176.0,'l':V('left',0.4),'up':1.3,'every':7.0,'count':5},
 {'image':'board-advan','s':212.0,'l':V('left',0.4),'up':1.5,'every':7.0,'count':15},
 {'image':'tsukuba-shed','s':500.0,'l':V('left',-16)},
 {'image':'tsukuba-paddock','s':505.0,'l':V('right',13)},
 {'image':'tsukuba-hairpin-stand','s':634.0,'l':V('right',13)},
 {'image':'board-bridgestone','s':652.0,'l':V('right',7),'up':0.8},
 {'image':'board-matsunaga','s':665.0,'l':V('right',7),'up':0.8},
 {'image':'board-blank','s':677.0,'l':V('right',7),'up':0.8},
 {'image':'board-supergt','s':689.0,'l':V('right',7),'up':0.8},
 {'image':'lamp-post','s':1300.0,'l':V('right',2.5),'every':70.0,'count':6},
 {'image':'lamp-post','s':940.0,'l':V('right',2.5),'every':60.0,'count':4},
 {'image':'lamp-post','s':330.0,'l':V('left',-2.5),'every':70.0,'count':4},
 {'image':'light-mast','s':112.0,'l':V('left',-4)},{'image':'light-mast','s':1950.0,'l':V('left',-4)},{'image':'light-mast','s':535.0,'l':V('left',-4)},{'image':'light-mast','s':1745.0,'l':V('left',-5)},{'image':'light-mast','s':1255.0,'l':V('right',6)},
 {'image':'marshal-tower','s':1000.0,'l':V('right',30)},
 {'image':'pylon','s':1000.0,'l':-130.0},{'image':'pylon','s':1150.0,'l':140.0},{'image':'pylon','s':1260.0,'l':-150.0},{'image':'pylon','s':420.0,'l':-140.0},
 {'image':'pylon','s':1150.0,'l':60.0},{'image':'pylon','s':1100.0,'l':-80.0},
 {'image':'marshal-tower','s':1615.0,'l':V('right',10)},
 {'image':'dunlop-arch','s':1630.0,'l':48.0},
 {'image':'tsukuba-shed','s':1765.0,'l':V('right',30)},
 {'image':'trees-a','s':1140.0,'l':V('left',-25)},
 {'image':'trees-b','s':1225.0,'l':V('left',-38),'up':3.0},
 {'image':'treeline','s':1330.0,'l':V('left',-30),'every':55.0,'count':7},
 {'image':'trees-b','s':1672.0,'l':V('left',-19),'every':25.0,'count':4},
 {'image':'tsukuba-final-stand','s':1910.0,'l':V('left',-38)},
 {'image':'board-wakos','s':1935.0,'l':V('left',-5)},
 {'image':'treeline','s':1760.0,'l':V('left',-40)},
]
