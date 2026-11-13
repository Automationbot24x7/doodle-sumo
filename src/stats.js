// One place that counts the Lux3D work behind the game, so the Lab page and the report always show the same numbers.
// pipe = data/pipeline.json (tasks run by the build pipeline), runs = data/forge-demo.json (live forge runs),
// credits = data/credits.json (balance read from the Aholo account; the authoritative figure).
export function lux3dStats(pipe, fighters, runs, credits) {
  const ok = (pipe.tasks || []).filter((t) => t.ok);
  const forgeTasks = runs.reduce((n, r) => n + Object.keys(r.tasks || {}).length, 0);
  const secs = ok.reduce((s, t) => s + (t.secs || 0), 0) + runs.reduce((s, r) => s + (r.total || 0), 0);
  return {
    tasks: ok.length + forgeTasks,
    minutes: Math.round(secs / 60),
    house: fighters.filter((f) => !f.drawn).length,
    drawn: fighters.filter((f) => f.drawn).length,
    runs: runs.length,
    runsDone: runs.filter((r) => r.state === 'done').length,
    creditsUsed: credits ? credits.granted - credits.left : null,
    creditsChecked: credits?.checked || '',
  };
}
