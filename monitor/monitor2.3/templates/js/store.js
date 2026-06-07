class Store {
    constructor() {
        this.state = {
            tools: [],
            currentTool: null,
            currentMode: 'single',
            currentMenu: 'runtime',
            currentData: null,
            userData: null,
            isLoading: false,
            error: null
        };
        
        this.listeners = [];
        this.loadFromStorage();
    }
    
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }
    
    notify() {
        this.listeners.forEach(listener => listener(this.state));
        this.saveToStorage();
    }
    
    setState(updates) {
        Object.assign(this.state, updates);
        this.notify();
    }
    
    getState() {
        return this.state;
    }
    
    saveToStorage() {
        const toSave = {
            tools: this.state.tools,
            currentTool: this.state.currentTool
        };
        localStorage.setItem('eda_monitor_store', JSON.stringify(toSave));
    }
    
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('eda_monitor_store');
            if (saved) {
                const data = JSON.parse(saved);
                this.state.tools = data.tools || [];
                this.state.currentTool = data.currentTool;
            }
        } catch (e) {
            console.error('Failed to load from storage:', e);
        }
    }
    
    reset() {
        this.state = {
            tools: [],
            currentTool: null,
            currentMode: 'single',
            currentMenu: 'runtime',
            currentData: null,
            userData: null,
            isLoading: false,
            error: null
        };
        this.notify();
    }
}

const store = new Store();