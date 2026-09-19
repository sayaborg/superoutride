"""Deterministic offline plots of compiled readers. No geometry fitting or image extraction."""
import json
import pathlib
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

source, destination = map(pathlib.Path, sys.argv[1:])
data = json.loads(source.read_text())
samples = data['samples']
s = [p['s'] for p in samples]
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'axes.spines.top': False,
                     'axes.spines.right': False, 'savefig.facecolor': '#f8fafb'})
fig, axes = plt.subplots(5, 1, figsize=(12, 11), sharex=True, layout='constrained',
                         gridspec_kw={'height_ratios': [1.6, 1.6, 2.5, 1.8, 1]})
fig.suptitle(f"{data['course']} / {data['section']}\nCompiled source profiles · {data['lengthMeters']:.1f} m", fontsize=15)
axes[0].plot(s, [p['curvaturePerMeter']*1000 for p in samples], color='#176b9b')
axes[0].axhline(0, color='#aab5bf', linewidth=.7)
axes[0].set_ylabel('Guide curvature\n(1/km)')
axes[1].plot(s, [p['heightMeters'] for p in samples], color='#36805a')
axes[1].set_ylabel('Physical height\n(m)')
for i, name in enumerate(data['boundaries']):
    axes[2].plot(s, [p['boundaries'][i] for p in samples], label=name, linewidth=1.15)
axes[2].set_ylabel('Boundary l\n(m)')
axes[2].legend(ncol=4, fontsize=7, loc='upper center', bbox_to_anchor=(.5, -.12), frameon=False)
for i, asset in enumerate(sorted(set(p['asset'] for p in data['scenery']))):
    points = [p for p in data['scenery'] if p['asset'] == asset]
    axes[3].scatter([p['s'] for p in points], [p['l'] for p in points], s=12, marker='|', label=asset)
axes[3].set_ylabel('Scenery l\n(m)')
if data['scenery']:
    axes[3].legend(loc='upper right', fontsize=7)
for i, environment in enumerate(data['environments']):
    end = data['environments'][i+1]['s'] if i+1 < len(data['environments']) else data['lengthMeters']
    axes[4].broken_barh([(environment['s'], end-environment['s'])], (0, 1), color=plt.get_cmap('Pastel1')(i % 9))
    axes[4].text((environment['s']+end)/2, .5, environment['name'], ha='center', va='center', fontsize=8, clip_on=True)
axes[4].set_yticks([])
axes[4].set_ylabel('Environment')
axes[4].set_xlabel('Source station s (m)')
for ax in axes:
    ax.grid(axis='x', color='#dfe4e8', linewidth=.6)
    ax.set_xlim(0, data['lengthMeters'])
fig.savefig(destination/'bands.png', dpi=120, metadata={'Software': 'SUPER OUTRIDE course report'})
plt.close(fig)
fig, ax = plt.subplots(figsize=(7, 9), layout='constrained')
ax.plot([p['x'] for p in samples], [p['z'] for p in samples], color='#176b9b', linewidth=2)
for p, label, color in [(samples[0], 'START', '#24804e'), (samples[-1], 'END', '#b54e35')]:
    ax.scatter(p['x'], p['z'], color=color, s=35)
    ax.annotate(label, (p['x'], p['z']), xytext=(8, 0), textcoords='offset points', color=color)
ax.set_aspect('equal', adjustable='datalim')
ax.grid(color='#dfe4e8', linewidth=.6)
ax.set(xlabel='World x (m)', ylabel='World z (m)', title=f"{data['section']} · source plan\nOccurrence transforms are not geographical connections")
fig.savefig(destination/'plan.png', dpi=120, metadata={'Software': 'SUPER OUTRIDE course report'})
plt.close(fig)
