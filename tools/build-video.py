"""Assembles the Doodle Sumo demo video from real captures (video/cap/*), narration (video/vo/*.wav)
and the game's own music bed. Runs ffmpeg inside WSL. Usage: python tools/build-video.py"""
import json, subprocess, os

ROOT = 'C:/Hackathon/forge'
WROOT = '/mnt/c/Hackathon/forge'
XF = 0.35  # crossfade seconds

# (capture, start, duration, use game audio, hold-last-frame seconds, [(vo id, offset in segment)])
SEG = [
    ('game7', 71.4,  2.7, True,  0.0, []),                      # cold open: the final slap, slow-mo ring-out
    ('reel',  0.2, 11.6, False, 0.0, [('n1', 0.4)]),
    ('game7', 0.0,  5.6, True,  0.0, [('n2', 0.2)]),
    ('game7', 5.6, 19.2, True,  0.0, [('n3', 1.4), ('n4', 8.9)]),
    ('game7', 70.6, 9.8, True,  0.0, [('n5', 1.6)]),
    ('game7', 80.4, 7.0, True,  0.0, [('n6', 0.3)]),
    ('lab',   0.3, 13.9, False, 0.0, [('n7', 0.5)]),
    ('end',   0.0,  1.6, False, 4.4, [('n8', 0.8)]),
]
# (overlay png, segment index, offset in segment, duration)
OVER = [
    ('open', 0, 0.5, 2.2),
    ('cap-roster', 2, 0.5, 2.6), ('cap-room', 2, 3.2, 2.3),
    ('cap-stapler', 3, 5.6, 3.0), ('cap-fan', 3, 10.3, 2.8), ('cap-jack', 3, 16.9, 2.3),
    ('cap-flail', 4, 2.9, 2.6), ('cap-print', 5, 1.0, 4.5),
]

def sh(cmd):
    print('>', cmd[:200] + ('…' if len(cmd) > 200 else ''))
    r = subprocess.run(['wsl', '-d', 'Ubuntu-24.04', '--', 'bash', '-lc', cmd], capture_output=True, text=True)
    if r.returncode: print(r.stderr[-3000:]); raise SystemExit(1)
    return r.stdout

os.makedirs(f'{ROOT}/video/build', exist_ok=True)
B = f'{WROOT}/video/build'
starts, t = [], 0.0
for i, s in enumerate(SEG):
    starts.append(t); t += s[2] + s[4] - (XF if i < len(SEG) - 1 else 0)
total = t
print('total', round(total, 2))

# 1) per-segment video (30 fps CFR) and game audio
for i, (cap, ss, dur, aud, hold, _) in enumerate(SEG):
    d = f'{WROOT}/video/cap/{cap}'
    pad = f',tpad=stop_mode=clone:stop_duration={hold}' if hold else ''
    sh(f'cd {d} && ffmpeg -y -v error -f concat -safe 0 -i list.txt -ss {ss} -t {dur + hold:.3f} -vf "fps=30,scale=1920:1080:flags=lanczos,setsar=1{pad},format=yuv420p" -c:v libx264 -preset medium -crf 17 -an {B}/v{i}.mp4')
    if aud:
        sh(f'cd {d} && ffmpeg -y -v error -i audio.webm -ss {ss} -t {dur} -af "aresample=48000,apad=whole_dur={dur}" -ac 2 {B}/a{i}.wav')

# 2) video crossfade chain
inputs = ' '.join(f'-i {B}/v{i}.mp4' for i in range(len(SEG)))
fc, prev, off = [], '[0:v]', 0.0
for i in range(1, len(SEG)):
    off += SEG[i - 1][2] + SEG[i - 1][4] - XF
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
        fade_in = 0.25
        parts.append(f'[{k}:a]volume=1.5,afade=t=in:d={fade_in},afade=t=out:st={s[2]-0.3:.2f}:d=0.3,adelay={ms}|{ms}[g{k}]'); labels.append(f'[g{k}]'); k += 1
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
