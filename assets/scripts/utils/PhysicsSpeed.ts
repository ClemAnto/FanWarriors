import { PhysicsSystem2D } from 'cc';

/** Engine default Box2D step (PhysicsSystem2D.fixedTimeStep). */
const BASE_STEP = 1 / 60;

let installed = false;
let speed = 1;

/**
 * Run the 2D physics `k` times faster than real time WITHOUT changing what happens: every body
 * follows the same path (same impulse, damping, bounces, landing point) — only sooner.
 *
 * How: the engine steps Box2D in fixed steps out of an accumulator fed with the frame dt
 * (`PhysicsSystem2D.postUpdate`, maxSubSteps 1). We feed it `dt × k` and enlarge the step to
 * `k / 60`, so each frame still runs exactly one step, just a longer one. Per-frame forces
 * (magnet, cohesion, drift) keep their per-simulated-second strength because they are still
 * applied once per step. A larger step means a longer hop per step: every warrior keeps the
 * `bullet` flag (Warrior.buildPhysics) so none can tunnel through another one.
 *
 * Scheduler timers, tweens and component dt stay in real time.
 */
export function setPhysicsSpeed(k: number): void {
    const sys = PhysicsSystem2D.instance as unknown as { postUpdate(dt: number): void; fixedTimeStep: number };
    speed = k > 0 ? k : 1;
    sys.fixedTimeStep = BASE_STEP * speed;
    if (installed) return;
    installed = true;
    const original = sys.postUpdate;
    sys.postUpdate = function (this: unknown, dt: number): void {
        original.call(this, dt * speed);
    };
}

export function getPhysicsSpeed(): number { return speed; }
