(function () {
  'use strict';
  const FB = window.FB, U = FB.util, S = FB.store;

  FB.views.settings = {
    render(root) {
      const st = S.get();
      FB.ui.setTitle('<h1>More</h1>');
      const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
      root.innerHTML = `
        <div class="card"><h2 style="margin-bottom:10px">Team</h2>
          <div class="two"><div class="field-row"><label>Team name</label><input type="text" id="tname" value="${U.esc(st.team.name)}"></div>
          <div class="field-row"><label>Season</label><input type="text" id="tseason" value="${U.esc(st.team.season)}" placeholder="Fall 2026"></div></div>
          <div class="field-row"><label>Your name <span class="muted" style="text-transform:none;letter-spacing:0">(signs your film comments)</span></label><input type="text" id="coach" value="${U.esc(st.settings.coachName || '')}" placeholder="Coach Ray" autocomplete="name"></div>
          <div class="field-row"><label>Quarters per game</label><select id="quarters">${[2, 4].map(n => `<option value="${n}"${(st.settings.quarters || 4) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        </div>
        <div class="card"><h2 style="margin-bottom:10px">Backup & sharing</h2>
          <p class="small muted">Everything is stored on this device. Export a backup file regularly, or send it to an assistant coach who can import it.</p>
          <div class="row wrap"><button class="btn primary" id="export">⬇︎ Export backup</button>${navigator.share ? '<button class="btn" id="share">Share…</button>' : ''}<label class="btn">⬆︎ Import<input type="file" id="import" accept="application/json,.json" class="hidden"></label></div>
        </div>
        <div class="card"><h2 style="margin-bottom:10px">Playbook</h2>
          <div class="row wrap"><a class="btn" href="#/print">🖨 Print all plays</a><button class="btn" id="seed">Restore sample Raiders plays</button></div>
        </div>
        <div class="card"><h2 style="margin-bottom:10px">Install on your phone</h2>
          ${standalone ? '<p class="small">✅ Installed. Works offline.</p>'
            : location.protocol === 'file:' ? `<p class="small muted">You are running the single-file version${S.storageOK === false ? ', and this viewer <b>does not keep saved data</b>' : ''}. For a home-screen app that saves and works offline, open the hosted version in Safari and choose <b>Add to Home Screen</b>.</p>`
            : `<p class="small muted">iPhone/iPad: tap the Share button in Safari, then <b>Add to Home Screen</b>. Android: menu → <b>Install app</b>. The app then works offline on the field.</p>`}
        </div>
        <div class="card"><h2 style="margin-bottom:10px">Danger zone</h2><button class="btn danger" id="reset">Erase everything</button></div>
        <p class="small muted" style="text-align:center;margin-top:16px">FlagBook · data stays on this device</p>`;
      root.querySelector('#tname').onchange = e => S.mutate(s => s.team.name = e.target.value.trim());
      root.querySelector('#tseason').onchange = e => S.mutate(s => s.team.season = e.target.value.trim());
      root.querySelector('#quarters').onchange = e => S.mutate(s => s.settings.quarters = +e.target.value);
      root.querySelector('#coach').onchange = e => S.mutate(s => s.settings.coachName = e.target.value.trim());
      root.querySelector('#export').onclick = () => U.download(`flagbook-${(st.team.name || 'team').replace(/\W+/g, '-')}-${U.todayISO()}.json`, S.exportJSON());
      const share = root.querySelector('#share');
      if (share) share.onclick = async () => {
        try {
          const file = new File([S.exportJSON()], `flagbook-${U.todayISO()}.json`, { type: 'application/json' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'FlagBook backup' });
          else await navigator.share({ title: 'FlagBook backup', text: S.exportJSON() });
        } catch (e) { /* cancelled */ }
      };
      root.querySelector('#import').onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          U.confirm('Import this backup.\n\nReplace everything with the file, or merge it into the data already here?', { ok: 'Replace', cancel: 'Merge', danger: true }).then(replace => {
            try { S.importJSON(r.result, replace ? 'replace' : 'merge'); U.toast('Imported'); } catch (err) { U.toast('Could not import: ' + err.message, 4000); }
          });
        };
        r.readAsText(f);
      };
      root.querySelector('#seed').onclick = () => { S.resetSeedPlays(); U.toast('Sample plays added'); };
      root.querySelector('#reset').onclick = () => U.confirm('Erase roster, schedule, games, plays and clips on this device?', { ok: 'Erase', danger: true })
        .then(ok => ok && U.confirm('Really erase everything? Export a backup first if unsure.', { ok: 'Erase everything', danger: true }))
        .then(ok => { if (ok) { FB.media.clear().catch(() => {}); S.reset(); U.toast('Erased'); } });
    }
  };
})();
