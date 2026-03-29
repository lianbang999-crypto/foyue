cat << 'INNER_EOF' >> src/css/pages.css

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
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg-card) 50%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    color: var(--text-secondary);
    font-size: .8rem;
    font-weight: 500;
    font-family: var(--font-zh);
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    transition: all .2s cubic-bezier(0.25, 1, 0.5, 1);
}

.counter-pill-btn:hover {
    background: color-mix(in srgb, var(--text-secondary) 8%, var(--bg-card));
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.06);
}

.counter-pill-btn:active {
                                                   }
                      ac                  v                      ac und:                      a              : c                   ar(--accent) 30%, transparent               ow: i                  -mix(in srgb, var(--accent) 15%, transparent);
}

.counter-pill-btn svg {
    color    color    color   lex-shrink: 0;
}
INNER_EOF
