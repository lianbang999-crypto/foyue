const fs = require('fs');

let css = fs.readFileSync('src/css/pages.css', 'utf8');

css += `
/* ====== 药丸操作区/Pill Actions ======= */
.counter-pill-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-top: 10px;
    margin-bottom: -15px;
    z-index: 10;
}

.counter-pill-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius    border-radius  ;
    border-radius    border-ra);
    border-radius    border-ra);
s    border-radius    border-radiactive {
                      teY(1px);
    opacity: 0.85;
}
}
  opacity: 0.85;
   ac   ac   ac   aor: v   ac   ac   ac   aor: v   d:   ac   ac   ac   ao
    border-color: c    border-color: c r(    border-color: c    bnt    border-chadow: inset 0 0 8px color-m    border-color:-a    border-color: crent);    border-c-p    border-color: c  or: currentColor;
    flex-shrink: 0;
}
`;

fs.writeFileSync('src/css/pages.css', css);
