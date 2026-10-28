import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the bare `three` specifier to the Node test stub before any test
 * imports a world module. Must be the first import in the test file.
 */
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'three') {
            return {
                url: new URL('../helpers/three-stub.mjs', import.meta.url).href,
                shortCircuit: true
            };
        }
        return nextResolve(specifier, context);
    }
});

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
