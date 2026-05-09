import { _decorator, Component, Node, Graphics, Label, Color, Vec2, Input, input, EventTouch } from 'cc';
import { COLORS, WARRIOR_RADII, Warrior } from '../entities/Warrior';
import { GAME_OVER_LINE_Y, TRACK_W } from '../entities/Track';
const { ccclass } = _decorator;

const DESIGN_W = 1280;
const DESIGN_H = 720;

// ── Panel geometry (world space, canvas 1280×720 centred at origin) ──
const CX         = 490;   // centre x — same as HUD_RIGHT_X
const PANEL_TOP  =  68;   // below HUD NEXT preview (which sits at y≈90)
const PANEL_BOT  = -352;
const PANEL_W    =  230;
const PANEL_HALF = PANEL_W / 2;

// Pause / Resume button
const BTN_PAUSE_Y = 42;
const BTN_PAUSE_W = 170;
const BTN_PAUSE_H = 26;

// Section dividers
const DIV1_Y = 12;   // PAUSE  ↔ ROUND
const DIV2_Y = -78;  // MERGES ↔ SAVE/LOAD/RESET
const DIV3_Y = -110; // SAVE   ↔ PALETTE

// Round row
const ROUND_LBL_Y  =   2;
const ROUND_ROW_Y  = -18;
const ROUND_BTN_W  =  26;
const ROUND_BTN_H  =  22;
const ROUND_BTN_GAP = 52;

// Merges row
const MERGE_LBL_Y  = -36;
const MERGE_ROW_Y  = -56;
const MERGE_BTN_W  =  26;
const MERGE_BTN_H  =  22;
const MERGE_BTN_GAP = 52;

// Save / Load / Reset buttons
const ACTION_Y   = -90;
const ACTION_W   =  48;
const ACTION_H   =  22;
const SAVE_X     = CX - 62;
const LOAD_X     = CX;
const RESET_X    = CX + 62;

// Palette
const PAL_TITLE_Y  = -118;
const PAL_START_Y  = -138;
const ICON_R       =   15;
const ICON_SPACING =   26;

const MAX_ROUND = 7;

// ── Interface exposed to GameManager ──

export interface IGameManagerDebug {
    isTimerPaused(): boolean;
    setTimerPaused(v: boolean): void;
    getCurrentRound(): number;
    setDebugRound(r: number): void;
    getTotalMerges(): number;
    setTotalMerges(n: number): void;
    getWarriors(): readonly Warrior[];
    addDebugWarrior(type: number, level: number, x: number, y: number): void;
    cycleDebugWarriorLevel(w: Warrior): void;
    saveDebugState(): void;
    loadDebugState(): void;
    resetDebugState(): void;
}

@ccclass('DebugPanel')
export class DebugPanel extends Component {
    private gm!: IGameManagerDebug;
    private bg!: Graphics;
    private pauseLbl!: Label;
    private roundLbl!: Label;
    private mergesLbl!: Label;
    private ghost: Node | null = null;
    private dragType = -1;
    private tapWarrior: Warrior | null = null;
    private tapStart: Vec2 | null = null;

    init(gm: IGameManagerDebug): void {
        this.gm = gm;
        this.build();
        input.on(Input.EventType.TOUCH_START,  this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE,   this.onTouchMove,  this);
        input.on(Input.EventType.TOUCH_END,    this.onTouchEnd,   this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,   this);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START,  this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE,   this.onTouchMove,  this);
        input.off(Input.EventType.TOUCH_END,    this.onTouchEnd,   this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,   this);
        if (this.ghost?.isValid) this.ghost.destroy();
    }

    // ── static UI build ──

    private build(): void {
        this.bg = this.node.addComponent(Graphics);
        this.drawPanel();

        this.lbl('─ DEBUG ─', CX, PANEL_TOP - 14, 12, new Color(110, 110, 130, 200));

        // Pause / Resume
        this.pauseLbl = this.lbl(this.pauseText(), CX, BTN_PAUSE_Y, 14, new Color(255, 255, 255, 255));

        // Round
        this.lbl('ROUND', CX, ROUND_LBL_Y, 11, new Color(150, 150, 170, 200));
        this.roundLbl = this.lbl(String(this.gm.getCurrentRound()), CX, ROUND_ROW_Y, 19, new Color(255, 220, 50, 255));
        this.lbl('−', CX - ROUND_BTN_GAP, ROUND_ROW_Y, 18, new Color(220, 220, 220, 230));
        this.lbl('+', CX + ROUND_BTN_GAP, ROUND_ROW_Y, 18, new Color(220, 220, 220, 230));

        // Merges
        this.lbl('MERGES', CX, MERGE_LBL_Y, 11, new Color(150, 150, 170, 200));
        this.mergesLbl = this.lbl(String(this.gm.getTotalMerges()), CX, MERGE_ROW_Y, 19, new Color(120, 220, 140, 255));
        this.lbl('−', CX - MERGE_BTN_GAP, MERGE_ROW_Y, 18, new Color(220, 220, 220, 230));
        this.lbl('+', CX + MERGE_BTN_GAP, MERGE_ROW_Y, 18, new Color(220, 220, 220, 230));

        // Save / Load / Reset
        this.lbl('SAVE',  SAVE_X,  ACTION_Y, 12, new Color(200, 200, 200, 230));
        this.lbl('LOAD',  LOAD_X,  ACTION_Y, 12, new Color(200, 200, 200, 230));
        this.lbl('RESET', RESET_X, ACTION_Y, 11, new Color(200, 200, 200, 230));

        // Palette
        this.lbl('PALETTE', CX, PAL_TITLE_Y, 11, new Color(110, 110, 130, 200));
        for (let t = 0; t < 7; t++) {
            const y = PAL_START_Y - t * ICON_SPACING;
            this.lbl('1',       CX,              y, 11, new Color(255, 255, 255, 210));
            this.lbl(String(t), CX + ICON_R + 12, y, 10, COLORS[t]);
        }
    }

    private drawPanel(): void {
        const g = this.bg;
        g.clear();

        // Background
        g.fillColor = new Color(15, 15, 28, 215);
        g.rect(CX - PANEL_HALF, PANEL_BOT, PANEL_W, PANEL_TOP - PANEL_BOT);
        g.fill();
        g.strokeColor = new Color(65, 65, 95, 160);
        g.lineWidth = 1;
        g.rect(CX - PANEL_HALF, PANEL_BOT, PANEL_W, PANEL_TOP - PANEL_BOT);
        g.stroke();

        // Section dividers
        for (const dy of [DIV1_Y, DIV2_Y, DIV3_Y]) {
            g.strokeColor = new Color(55, 55, 80, 130);
            g.lineWidth = 0.5;
            g.moveTo(CX - PANEL_HALF + 12, dy);
            g.lineTo(CX + PANEL_HALF - 12, dy);
            g.stroke();
        }

        // Pause / Resume button
        const paused = this.gm?.isTimerPaused() ?? false;
        g.fillColor = paused ? new Color(35, 110, 35, 240) : new Color(110, 35, 35, 240);
        g.rect(CX - BTN_PAUSE_W / 2, BTN_PAUSE_Y - BTN_PAUSE_H / 2, BTN_PAUSE_W, BTN_PAUSE_H);
        g.fill();
        g.strokeColor = paused ? new Color(80, 200, 80, 200) : new Color(200, 80, 80, 200);
        g.lineWidth = 1.5;
        g.rect(CX - BTN_PAUSE_W / 2, BTN_PAUSE_Y - BTN_PAUSE_H / 2, BTN_PAUSE_W, BTN_PAUSE_H);
        g.stroke();

        // Round −/+ buttons
        g.fillColor = new Color(45, 45, 75, 230);
        g.rect(CX - ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H);
        g.fill();
        g.rect(CX + ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H);
        g.fill();

        // Merges −/+ buttons
        g.rect(CX - MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H);
        g.fill();
        g.rect(CX + MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H);
        g.fill();

        // SAVE button (blue-ish)
        g.fillColor = new Color(30, 70, 130, 230);
        g.rect(SAVE_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.fill();
        g.strokeColor = new Color(80, 140, 220, 180);
        g.lineWidth = 1;
        g.rect(SAVE_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.stroke();

        // LOAD button (green-ish)
        g.fillColor = new Color(30, 100, 50, 230);
        g.rect(LOAD_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.fill();
        g.strokeColor = new Color(80, 200, 120, 180);
        g.lineWidth = 1;
        g.rect(LOAD_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.stroke();

        // RESET button (orange-ish)
        g.fillColor = new Color(130, 70, 20, 230);
        g.rect(RESET_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.fill();
        g.strokeColor = new Color(220, 140, 60, 180);
        g.lineWidth = 1;
        g.rect(RESET_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H);
        g.stroke();

        // Palette icons (7 types, level 1)
        for (let t = 0; t < 7; t++) {
            const y = PAL_START_Y - t * ICON_SPACING;
            g.fillColor = new Color(COLORS[t].r, COLORS[t].g, COLORS[t].b, 210);
            g.circle(CX, y, ICON_R);
            g.fill();
            g.strokeColor = new Color(255, 255, 255, 110);
            g.lineWidth = 1.5;
            g.circle(CX, y, ICON_R);
            g.stroke();
        }
    }

    refresh(): void {
        this.drawPanel();
        this.pauseLbl.string  = this.pauseText();
        this.roundLbl.string  = String(this.gm.getCurrentRound());
        this.mergesLbl.string = String(this.gm.getTotalMerges());
    }

    private pauseText(): string {
        return this.gm?.isTimerPaused() ? '▶  RESUME' : '||  PAUSE';
    }

    private lbl(text: string, x: number, y: number, size: number, color: Color): Label {
        const n = new Node();
        n.setParent(this.node);
        n.setPosition(x, y);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.color = color;
        return l;
    }

    // ── touch handling ──

    private toWorld(ui: Vec2): Vec2 {
        return new Vec2(ui.x - DESIGN_W / 2, ui.y - DESIGN_H / 2);
    }

    private onTouchStart(e: EventTouch): void {
        const p = this.toWorld(e.getUILocation());

        // Pause / Resume
        if (this.inRect(p, CX - BTN_PAUSE_W / 2, BTN_PAUSE_Y - BTN_PAUSE_H / 2, BTN_PAUSE_W, BTN_PAUSE_H)) {
            this.gm.setTimerPaused(!this.gm.isTimerPaused());
            this.refresh();
            return;
        }

        // Round −
        if (this.inRect(p, CX - ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H)) {
            this.gm.setDebugRound(Math.max(1, this.gm.getCurrentRound() - 1));
            this.refresh();
            return;
        }
        // Round +
        if (this.inRect(p, CX + ROUND_BTN_GAP - ROUND_BTN_W / 2, ROUND_ROW_Y - ROUND_BTN_H / 2, ROUND_BTN_W, ROUND_BTN_H)) {
            this.gm.setDebugRound(Math.min(MAX_ROUND, this.gm.getCurrentRound() + 1));
            this.refresh();
            return;
        }

        // Merges −
        if (this.inRect(p, CX - MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H)) {
            this.gm.setTotalMerges(this.gm.getTotalMerges() - 1);
            this.refresh();
            return;
        }
        // Merges +
        if (this.inRect(p, CX + MERGE_BTN_GAP - MERGE_BTN_W / 2, MERGE_ROW_Y - MERGE_BTN_H / 2, MERGE_BTN_W, MERGE_BTN_H)) {
            this.gm.setTotalMerges(this.gm.getTotalMerges() + 1);
            this.refresh();
            return;
        }

        // SAVE
        if (this.inRect(p, SAVE_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H)) {
            this.gm.saveDebugState();
            return;
        }
        // LOAD
        if (this.inRect(p, LOAD_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H)) {
            this.gm.loadDebugState();
            this.refresh();
            return;
        }
        // RESET
        if (this.inRect(p, RESET_X - ACTION_W / 2, ACTION_Y - ACTION_H / 2, ACTION_W, ACTION_H)) {
            this.gm.resetDebugState();
            this.refresh();
            return;
        }

        // Palette icon — start drag
        for (let t = 0; t < 7; t++) {
            const iy = PAL_START_Y - t * ICON_SPACING;
            if (Vec2.distance(p, new Vec2(CX, iy)) <= ICON_R + 8) {
                this.dragType = t;
                this.spawnGhost(t, p);
                return;
            }
        }

        // Tap on settled warrior to cycle level
        for (const w of this.gm.getWarriors()) {
            if (!w.crossedLine || !w.node?.isValid) continue;
            const wp = w.node.position;
            if (Vec2.distance(p, new Vec2(wp.x, wp.y)) <= w.radius + 6) {
                this.tapWarrior = w;
                this.tapStart   = p.clone();
                return;
            }
        }
    }

    private onTouchMove(e: EventTouch): void {
        if (this.dragType < 0) return;
        const p = this.toWorld(e.getUILocation());
        if (this.ghost?.isValid) this.ghost.setPosition(p.x, p.y);
    }

    private onTouchEnd(e: EventTouch): void {
        // Palette drag: place warrior on drop inside track
        if (this.dragType >= 0) {
            const p = this.toWorld(e.getUILocation());
            if (this.ghost?.isValid) { this.ghost.destroy(); this.ghost = null; }
            if (Math.abs(p.x) <= TRACK_W / 2 && p.y > GAME_OVER_LINE_Y + 20) {
                this.gm.addDebugWarrior(this.dragType, 1, p.x, p.y);
            }
            this.dragType = -1;
            return;
        }

        // Short tap on warrior → cycle level
        if (this.tapWarrior && this.tapStart) {
            const p = this.toWorld(e.getUILocation());
            if (Vec2.distance(p, this.tapStart) < 15 && this.tapWarrior.node?.isValid) {
                this.gm.cycleDebugWarriorLevel(this.tapWarrior);
            }
        }
        this.tapWarrior = null;
        this.tapStart   = null;
    }

    private spawnGhost(type: number, pos: Vec2): void {
        if (this.ghost?.isValid) this.ghost.destroy();
        const n = new Node('Ghost');
        n.setParent(this.node.parent!);
        n.setPosition(pos.x, pos.y);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(COLORS[type].r, COLORS[type].g, COLORS[type].b, 140);
        g.circle(0, 0, WARRIOR_RADII[1]);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 160);
        g.lineWidth = 2;
        g.circle(0, 0, WARRIOR_RADII[1]);
        g.stroke();
        this.ghost = n;
    }

    private inRect(p: Vec2, x: number, y: number, w: number, h: number): boolean {
        return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
    }
}
