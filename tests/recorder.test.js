(function () {
  const R = FB.recorder;
  test('recorder is unsupported outside a browser', () => { eq(R.supported, false); eq(R.enabled(), false); });
  test('pickMime takes the first type the browser can record', () => {
    eq(R.pickMime(t => t === 'video/webm'), 'video/webm');
    eq(R.pickMime(t => /mp4/.test(t)), 'video/mp4;codecs=avc1');
    eq(R.pickMime(() => false), '');
    eq(R.pickMime(() => { throw new Error('nope'); }), '');
    eq(R.containerOf('video/mp4;codecs=avc1'), 'video/mp4'); eq(R.containerOf(''), ''); eq(R.containerOf(undefined), '');
  });
  test('bitrateFor scales with pixels and frame rate within 4–40 Mbps', () => {
    eq(R.bitrateFor(1920, 1080, 30), 16e6); eq(R.bitrateFor(1920, 1080, 60), 24e6);
    eq(R.bitrateFor(3840, 2160, 30), 40e6); near(R.bitrateFor(1280, 720, 30), 7.11e6, 2e4);
    eq(R.bitrateFor(0, 0), 16e6); eq(R.bitrateFor(320, 240), 4e6);
  });
  const iphone = [
    { kind: 'audioinput', deviceId: 'mic', label: 'iPhone Microphone' },
    { kind: 'videoinput', deviceId: 'front', label: 'Front Camera' },
    { kind: 'videoinput', deviceId: 'back', label: 'Back Camera' },
    { kind: 'videoinput', deviceId: 'uw', label: 'Back Ultra Wide Camera' },
    { kind: 'videoinput', deviceId: 'dual', label: 'Back Dual Wide Camera' }
  ];
  test('pickLens finds the ultra-wide or the plain back camera', () => {
    eq(R.pickLens(iphone, 'ultra'), 'uw'); eq(R.pickLens(iphone, 'wide'), 'back');
    eq(R.hasUltraWide(iphone), true); eq(R.lensOf(iphone, 'uw'), 'ultra'); eq(R.lensOf(iphone, 'back'), 'wide');
    const one = [{ kind: 'videoinput', deviceId: 'b', label: 'Back Camera' }];
    eq(R.pickLens(one, 'ultra'), 'b'); eq(R.pickLens(one, 'wide'), 'b'); eq(R.hasUltraWide(one), false);
    const blank = [{ kind: 'videoinput', deviceId: 'x', label: '' }];     // before permission iOS hides the labels
    eq(R.pickLens(blank, 'ultra'), null); eq(R.pickLens([], 'wide'), null); eq(R.pickLens(null, 'wide'), null);
    eq(R.pickLens([{ kind: 'videoinput', deviceId: 'd', label: 'Back Dual Wide Camera' }], 'wide'), 'd');
  });
  test('constraints and file names', () => {
    const c = R.constraintsFor('abc');
    eq(c.audio, true); eq(c.video.deviceId, { exact: 'abc' }); eq(c.video.facingMode, undefined);
    eq(c.video.width, { ideal: 3840 }); eq(c.video.frameRate, { ideal: 60, max: 60 });
    eq(R.constraintsFor(null).video.facingMode, 'environment');
    eq(R.fileName('video/mp4;codecs=avc1', 5), 'clip-5.mp4'); eq(R.fileName('video/webm', 5), 'clip-5.webm'); eq(R.fileName('', 5), 'clip-5.mov');
    assert(/^clip-\d+\.mp4$/.test(R.fileName('video/mp4')), 'timestamp default');
  });
})();
