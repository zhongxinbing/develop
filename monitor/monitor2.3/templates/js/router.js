class Router {
    constructor() {
        this.routes = { '/': HomePage, '/config': ConfigPage, '/tool': ToolPage };
        this.currentPage = null;
        window.addEventListener('popstate', () => this.handleRoute());
    }
    
    navigateTo(path) {
        window.history.pushState({}, '', path);
        this.handleRoute();
    }
    
    async handleRoute() {
        const path = window.location.pathname;
        const PageClass = this.routes[path] || this.routes['/'];
        if (this.currentPage?.destroy) this.currentPage.destroy();
        this.currentPage = new PageClass();
        await this.currentPage.render();
    }
    
    start() { this.handleRoute(); }
}

const router = new Router();