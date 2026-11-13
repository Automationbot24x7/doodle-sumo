"""Assembles the Doodle Sumo demo video from real captures (video/cap/*), narration (video/vo/*.wav)
and the game's own music bed. Runs ffmpeg inside WSL. Usage: python tools/build-video.py [end-variant]"""
import json, subprocess, os, sys

ROOT = 'C:/Hackathon/forge'
WROOT = '/mnt/c/Hackathon/forge'
XF = 0.35  # crossfade seconds
END = sys.argv[1] if len(sys.argv) > 1 else 'end2'      # end2 = "draw your own" end card, end3 = plain
ENDVO = 'f8' if END == 'end2' else 'n8'

# (capture, start, duration of source, use game audio, hold-last-frame seconds, [(vo id, offset in segment)], speed)
SEG = [
    ('match23', 46.9,  3.0, True,  0.0, [], 1),                       # cold open: final showdown, a rival flies off, the cat wins
    ('forge2',   4.4, 14.0, False, 0.0, [('f1', 0.5)], 2.6),          # the doodle is drawn on the in-game pad (shown 2.6x)
    ('forge2',  18.4,  4.0, True,  0.0, [('g1', 0.9)], 1),            # "Bring it to life": the doodle lands on the desk
    ('forge2',  54.3,  4.2, True,  0.0, [], 1),                       # Lux3D toy concept arrives
    ('forge2', 117.4,  5.0, True,  0.0, [('g2', 1.2)], 1),            # Lux3D 3D model arrives
    ('forge2', 222.2, 11.2, True,  0.0, [('g3', 0.8), ('g4', 6.8)], 1),  # rigged: its skeleton, then its moves
    ('match23',  5.2,  9.2, True,  0.0, [('f3', 0.3)], 1),            # round 1
    ('match23', 14.4, 10.0, True,  0.0, [('n4', 0.3)], 1),            # fan gust, showdown, jack-in-the-box, round win
    ('match23', 40.6,  9.3, True,  0.0, [('n5', 2.4)], 1),            # round 3: stapler, ring-outs, match point
    ('match23', 52.6, 10.8, True,  0.0, [('f6', 2.2)], 1),            # champion dance, results, print file
    ('lab2',     0.0, 12.6, False, 1.0, [('n7', 0.5)], 1),            # Lab page close-up
    (END,        0.0,  0.03, False, 6.0, [(ENDVO, 0.7)], 1),
]
# (overlay png, segment index, offset in segment (output seconds), duration)
OVER = [
    ('open2', 0, 0.4, 2.5),
    ('cap-pad', 1, 0.6, 3.8),
    ('cap-toy', 3, 0.9, 3.0), ('cap-model', 4, 1.1, 3.5),
    ('cap-rig', 5, 0.8, 2.4), ('cap-moves', 5, 3.7, 3.6),
    ('cap-room', 6, 0.8, 2.6),
    ('cap-fan', 7, 0.7, 2.5), ('cap-jack', 7, 5.6, 2.8),
    ('cap-stapler', 8, 1.3, 2.6), ('cap-flail', 8, 6.7, 2.3),
    ('cap-print2', 9, 4.2, 4.6),
    ('cap-lab', 10, 5.0, 3.6),
]

def sh(cmd):
    print('>', cmd[:200] + ('…' if len(cmd) > 200 else ''))
    r = subprocess.run(['wsl', '-d', 'Ubuntu-24.04', '--', 'bash', '-lc', cmd], capture_output=True, text=True)
    if r.returncode: print(r.stderr[-3000:]); raise SystemExit(1)
    return r.stdout

os.makedirs(f'{ROOT}/video/build', exist_ok=True)
B = f'{WROOT}/video/build'
out_dur = [s[2] / s[6] + s[4] for s in SEG]
starts, t = [], 0.0
for i, s in enumerate(SEG):
    starts.append(t); t += out_dur[i] - (XF if i < len(SEG) - 1 else 0)
total = t
print('total', round(total, 2))

# 1) per-segment video (30 fps CFR) and game audio
for i, (cap, ss, dur, aud, hold, _, speed) in enumerate(SEG):
    d = f'{WROOT}/video/cap/{cap}'
    pad = f',tpad=stop_mode=clone:stop_duration={hold}' if hold else ''
    sh(f'cd {d} && ffmpeg -y -v error -f concat -safe 0 -i list.txt -vf "trim=start={ss}:duration={dur:.3f},setpts=(PTS-STARTPTS)/{speed},fps=30,scale=1920:1080:flags=lanczos,setsar=1{pad},format=yuv420p" -t {out_dur[i]:.3f} -c:v libx264 -preset medium -crf 17 -an {B}/v{i}.mp4')
    if aud:
        sh(f'cd {d} && ffmpeg -y -v error -i audio.webm -ss {ss} -t {dur} -af "aresample=48000,apad=whole_dur={dur}" -ac 2 {B}/a{i}.wav')

# 2) video crossfade chain + caption overlays
inputs = ' '.join(f'-i {B}/v{i}.mp4' for i in range(len(SEG)))
fc, prev, off = [], '[0:v]', 0.0
for i in range(1, len(SEG)):
    off += out_dur[i - 1] - XF
    out = f'[x{i}]' if i < len(SEG) - 1 else '[vout]'
    fc.append(f'{prev}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}{out}')
    prev = out
n = len(SEG); prev = '[vout]'; oin = ''
for j, (png, si, o, d) in enumerate(OVER):
    st = starts[si] + o; oin += f' -loop 1 -t {total:.2f} -i {WROOT}/video/overlays/{png}.png'
    fc.append(f'[{n + j}:v]format=rgba,fade=in:st={st:.2f}:d=0.2:alpha=1,fade=out:st={st + d - 0.25:.2f}:d=0.25:alpha=1[o{j}]')
    out = f'[ov{j}]'
    fc.append(f"{prev}[o{j}]overlay=0:0:enable='between(t,{st:.2f},{st + d:.2f})'{out}"); prev = out
fc.append(f'{prev}null[vfinal]')
sh(f'ffmpeg -y -v error {inputs}{oin} -filter_complex "{";".join(fc)}" -map "[vfinal]" -t {total:.2f} -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p {B}/video.mp4')

# 3) audio: music bed + game sfx at segment starts + narration, music ducked under the voice
ain = [f'-i {WROOT}/video/cap/music/music.wav']
parts, labels, k = [], [], 1
for i, s in enumerate(SEG):
    if s[3]:
        ain.append(f'-i {B}/a{i}.wav'); ms = int(starts[i] * 1000)
        parts.append(f'[{k}:a]volume=1.5,afade=t=in:d=0.25,afade=t=out:st={s[2]-0.3:.2f}:d=0.3,adelay={ms}|{ms}[g{k}]'); labels.append(f'[g{k}]'); k += 1
vo = []
for i, s in enumerate(SEG):
    for vid, o in s[5]:
        ain.append(f'-i {WROOT}/video/vo/{vid}.wav'); ms = int((starts[i] + o) * 1000)
        parts.append(f'[{k}:a]aresample=48000,volume=1.6,adelay={ms}|{ms}[n{k}]'); vo.append(f'[n{k}]'); k += 1
parts.append(f'{"".join(vo)}amix=inputs={len(vo)}:normalize=0,apad=whole_dur={total:.2f}[voice]')
parts.append('[voice]asplit=2[voice1][voice2]')
parts.append(f'[0:a]aresample=48000,volume=2.2,atrim=0:{total:.2f},afade=t=in:d=1,afade=t=out:st={total-2:.2f}:d=2[mus]')
parts.append('[mus][voice2]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[musd]')
parts.append(f'[musd]{"".join(labels)}[voice1]amix=inputs={len(labels)+2}:normalize=0,atrim=0:{total:.2f},loudnorm=I=-15:TP=-1.5:LRA=9[aout]')
sh(f'ffmpeg -y -v error {" ".join(ain)} -filter_complex "{";".join(parts)}" -map "[aout]" -ar 48000 -ac 2 {B}/audio.wav')

# 4) mux
out = f'{WROOT}/video/doodle-sumo-demo.mp4'
sh(f'ffmpeg -y -v error -i {B}/video.mp4 -i {B}/audio.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart {out}')
print(sh(f'ffprobe -v error -show_entries format=duration -of csv=p=0 {out}'))
json.dump({'segments': SEG, 'starts': starts, 'total': total}, open(f'{ROOT}/video/build/edit.json', 'w'), indent=1)
