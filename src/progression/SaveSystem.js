export class SaveSystem {
    constructor() {
        this.key = 'apex_open_road_career_save';
    }
    
    load() {
        const raw = localStorage.getItem(this.key);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                // Ensure required arrays/objects exist (migration/safety)
                if (!data.ownedCars) data.ownedCars = ['ae86'];
                if (!data.upgrades) data.upgrades = {};
                if (!data.completedRaces) data.completedRaces = [];
                return data;
            } catch (e) {
                console.error("Save data corrupted! Creating new save...", e);
            }
        }
        
        // Return default save profile
        const defaultSave = {
            money: 5000,
            rep: 0,
            currentCar: 'ae86',
            ownedCars: ['ae86'],
            upgrades: {
                ae86: { engine: 0, transmission: 0, tires: 0, suspension: 0, nitro: 0 }
            },
            completedRaces: []
        };
        this.save(defaultSave);
        return defaultSave;
    }
    
    save(data) {
        localStorage.setItem(this.key, JSON.stringify(data));
    }
    
    reset() {
        localStorage.removeItem(this.key);
        return this.load();
    }
}
