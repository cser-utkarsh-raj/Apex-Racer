/**
 * TouchControls — on-screen driving controls for phones and tablets.
 *
 * The vehicle physics consumes boolean controls, so this is a set of large
 * momentary buttons rather than an analog stick. Multi-touch is tracked per
 * pointer id, which means throttle + steer + nitro work at the same time and a
 * finger sliding off a button always releases it (no stuck throttle).
 *
 * The pure helpers at the top are exported for unit tests; the class only
 * wires them to DOM events.
 */

export const TOUCH_ACTIONS = [
    'throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'nitro'
];

/** Empty control state consumed by the game loop. */
export function createTouchState() {
    const state = {};
    for (const action of TOUCH_ACTIONS) state[action] = false;
    return state;
}

/**
 * Decide whether to show touch controls.
 * `?touch=1` / `?touch=0` override detection so phones can be tested on a
 * desktop and hybrid laptops can opt out.
 */
export function detectTouch({
    maxTouchPoints = 0,
    coarsePointer = false,
    touchEvent = false,
    search = ''
} = {}) {
    let forced = null;
    try {
        forced = new URLSearchParams(search).get('touch');
    } catch {
        forced = null;
    }
    if (forced === '1') return true;
    if (forced === '0') return false;
    return Boolean(touchEvent || maxTouchPoints > 0 || coarsePointer);
}

/**
 * Set one action from one pointer. Returns true when the state changed.
 * `holds` maps action -> Set(pointerId) so two fingers on the same button do
 * not cancel each other when only one lifts.
 */
export function setTouchAction(state, holds, action, pointerId, active) {
    if (!state || !holds || !(action in state)) return false;
    if (!holds[action]) holds[action] = new Set();
    const held = holds[action];
    if (active) held.add(pointerId);
    else held.delete(pointerId);

    const next = held.size > 0;
    if (state[action] === next) return false;
    state[action] = next;
    return true;
}

export class TouchControls {
    constructor(root, { onChange = null } = {}) {
        this.root = root || null;
        this.onChange = typeof onChange === 'function' ? onChange : null;
        this.state = createTouchState();
        this.holds = Object.create(null);
        this._mounted = false;
        this._buttons = [];
        this._visible = false;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onContextMenu = (event) => event.preventDefault();
        this._onReleaseAll = () => this.releaseAll();
    }

    mount() {
        if (!this.root || this._mounted) return this;
        this._mounted = true;

        this.root.setAttribute('aria-hidden', 'true');
        for (const el of this.root.querySelectorAll('[data-touch-action]')) {
            const action = el.dataset.touchAction;
            if (!TOUCH_ACTIONS.includes(action)) continue;
            this._buttons.push({ el, action });
            el.addEventListener('pointerdown', this._onPointerDown);
            el.addEventListener('pointerup', this._onPointerUp);
            el.addEventListener('pointercancel', this._onPointerUp);
            el.addEventListener('lostpointercapture', this._onPointerUp);
            el.addEventListener('contextmenu', this._onContextMenu);
        }

        window.addEventListener('blur', this._onReleaseAll);
        document.addEventListener('visibilitychange', this._onReleaseAll);
        return this;
    }

    _onPointerDown(event) {
        const el = event.currentTarget;
        const action = el.dataset.touchAction;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        try { el.setPointerCapture(event.pointerId); } catch { /* older engines */ }
        el.classList.add('is-held');
        this._apply(action, event.pointerId, true);
    }

    _onPointerUp(event) {
        const el = event.currentTarget;
        const action = el.dataset.touchAction;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        try { el.releasePointerCapture(event.pointerId); } catch { /* already gone */ }
        this._apply(action, event.pointerId, false);
        if (!this.holds[action] || this.holds[action].size === 0) {
            el.classList.remove('is-held');
        }
    }

    _apply(action, pointerId, active) {
        const changed = setTouchAction(this.state, this.holds, action, pointerId, active);
        if (changed && this.onChange) this.onChange(this.state, action);
    }

    /** Release everything (blur, pause, screen change). */
    releaseAll() {
        let changed = false;
        for (const action of TOUCH_ACTIONS) {
            if (this.holds[action]) this.holds[action].clear();
            if (this.state[action]) {
                this.state[action] = false;
                changed = true;
            }
        }
        for (const { el } of this._buttons) el.classList.remove('is-held');
        if (changed && this.onChange) this.onChange(this.state, null);
        return this;
    }

    setVisible(visible) {
        this._visible = Boolean(visible);
        if (this.root) this.root.classList.toggle('is-visible', this._visible);
        if (this.root) this.root.setAttribute('aria-hidden', this._visible ? 'false' : 'true');
        if (!this._visible) this.releaseAll();
        return this;
    }

    get visible() { return this._visible; }

    isPressed(action) {
        return Boolean(this.state[action]);
    }

    destroy() {
        if (!this.root) return;
        for (const { el } of this._buttons) {
            el.removeEventListener('pointerdown', this._onPointerDown);
            el.removeEventListener('pointerup', this._onPointerUp);
            el.removeEventListener('pointercancel', this._onPointerUp);
            el.removeEventListener('lostpointercapture', this._onPointerUp);
            el.removeEventListener('contextmenu', this._onContextMenu);
        }
        window.removeEventListener('blur', this._onReleaseAll);
        document.removeEventListener('visibilitychange', this._onReleaseAll);
        this._buttons = [];
        this._mounted = false;
        this.releaseAll();
    }
}
