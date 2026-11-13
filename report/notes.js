// Text for the report that is not derived from the data files.
window.HERO_RUN = 'mittens';
window.HERO_WALL = '3 min 4 s';   // the on-screen clock when Mittens came alive (Lux3D task time 3 min 3 s)
window.STRESS_LABEL = {
  stick: 'Stick figure', outline: 'Outline only, no colour', bean: 'No arms', tiny: 'Tiny, in a corner',
  car: 'Not a character: a car', ghost: 'No legs', scribble: 'Quick messy scribble', dino: 'Dinosaur with a tail',
};
window.STRESS_LESSON = '<b>What we learned:</b> the Lux3D toy-image step is what makes this work. It turns any drawing into a humanoid toy in a T-pose (the car became a car-headed robot, the ghost grew legs), so the auto-rig accepted all eight. The scribble was refused once and passed on the relay\'s automatic second try. The crayon grain often came back as a bumpy surface, so the toy prompt now asks for smooth vinyl.';
// Credits: filled from the Aholo account balance (data/credits.json) when the report is rebuilt.
window.CREDIT_ROWS = "<tr><th>Where the credits went</th><th>Credits</th></tr><tr><td>Six house fighters (G1 or G1-Turbo, rig, ten moves, print file)</td><td>324</td></tr><tr><td>Nine desk props (text-to-3D)</td><td>180</td></tr><tr><td>Three trap articulations (URDF)</td><td>84</td></tr><tr><td>SpatialGen bedroom</td><td>10</td></tr><tr><td>Three pickups (G1-Turbo)</td><td>39</td></tr><tr><td>Iterations: Mugsy v1, move set v1, doodle-direct test, G1 vs G1-Turbo for all six</td><td>192</td></tr><tr><td>Live forges: Spike, Sir Whiskers \u00d72, Mittens, hosted-relay test, print files</td><td>188</td></tr><tr><td>Forge stress test: eight messy doodles, one automatic retry</td><td>286</td></tr><tr><td><b>Total used (account balance 2,297 of 3,600 left)</b></td><td><b>1303</b></td></tr>";
