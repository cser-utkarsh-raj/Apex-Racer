/**
 * TemplateCache — one shared, already-merged model per traffic vehicle type.
 *
 * Building a voxel vehicle is expensive (~600 cube meshes) and the loader
 * allocates a fresh material and texture on every call. Traffic only needs
 * visual clones, so the first request builds and bakes the model and every
 * later request clones that template (shared geometry + material).
 *
 * Concurrent requests for the same id share one build instead of racing.
 */
export class TemplateCache {
    constructor() {
        this._templates = new Map();
        this._pending = new Map();
    }

    has(id) {
        return this._templates.has(id);
    }

    get(id) {
        return this._templates.get(id) || null;
    }

    /**
     * @param {string} id template key (vehicle model id)
     * @param {(id: string) => object|Promise<object>} factory builds the model
     * @returns {Promise<object>} the shared template
     */
    load(id, factory) {
        if (this._templates.has(id)) return Promise.resolve(this._templates.get(id));
        if (this._pending.has(id)) return this._pending.get(id);

        const task = Promise.resolve()
            .then(() => factory(id))
            .then((template) => {
                if (template) this._templates.set(id, template);
                return template;
            })
            .finally(() => this._pending.delete(id));

        this._pending.set(id, task);
        return task;
    }

    clear() {
        this._templates.clear();
        this._pending.clear();
    }

    get size() {
        return this._templates.size;
    }
}
