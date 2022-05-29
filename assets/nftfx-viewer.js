//@ts-check
"use strict";

// import THREE from '//cdnjs.cloudflare.com/ajax/libs/three.js/r126/three.esm.js';
import { MultiPostFX } from './multipass.js';

const safeFetch = (url, type) =>
    fetch(url)
        .then(res => {
            if (res.ok)
                return res;
            else
                throw new Error(`[safeFetch] Request ${url} failed with code: ${res.status} ${res.statusText}`);
        })
        .then(res => type === 'json' ? res.json() : res.blob());

const makeAbsUrl = (metadata) => (assetUrl) => {
    let url = assetUrl;
    if (url.indexOf('://') !== -1)
        return url;
    let baseUrl = metadata?.properties?.nftfx?.baseUrl;
    console.log('!!', { url, baseUrl }, url.indexOf(baseUrl));
    if (url.indexOf(baseUrl) === -1) {
        url = baseUrl + (baseUrl.substr(-1, 1) === '/' ? '' : '/') + url;
    }
    if (url.indexOf('://') === -1) {
        url = window.location.origin + (url[0] === '/' ? '' : '/') + url;
    }
    return url;
}

///////////////////////////

export class NFTFXViewer extends HTMLElement {

    // camera;
    // scene;
    // mesh;
    // material;
    container;
    renderer;
    multipassRenderer;
    uniforms;
    mouseX = 0;
    mouseY = 0;
    startTime;
    metadata;

    static register() {
        if (typeof customElements.get('nftfx-viewer') === 'undefined') {
            customElements.define('nftfx-viewer', NFTFXViewer);
        }
    }

    static get observedAttributes() {
        return ['width', 'height', 'url'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        console.log(`[nftfx.attributeChangedCallback] Attribute "${name}" changed from "${oldValue}" to "${newValue}"`);
        this.render();
    }

    get width() {
        return parseInt(this.getAttribute("width"));
    }

    get height() {
        return parseInt(this.getAttribute("height"));
    }

    get url() {
        return this.getAttribute("url");
    }

    get autoplay() {
        return this.getAttribute("autoplay") === 'true';
    }

    get pixelRatio() {
        return parseFloat(this.getAttribute("pixelRatio")) || (window.devicePixelRatio ? window.devicePixelRatio : 1);
    }

    async init() {
        const THREE = window['THREE'];

        // this.camera = new THREE.Camera();
        // this.camera.position.z = 1;
        // this.scene = new THREE.Scene();

        this.startTime = Date.now();

        const metadata = await this.metadata;
        const attributes = metadata.attributes
            .reduce((acc, x) => ({ ...acc, [x.trait_type]: x.value }), {});
        const shaderOptions = metadata.properties.nftfx;
        console.log('[nftfx.init] Manifest:', metadata);
        const absUrl = makeAbsUrl(metadata);
        console.log('attributes', attributes);

        const makeResourceUrl = (url) =>
            url.replace(/\$\w+\$/g, x =>
                attributes[x.replace(/\$/g, '')] || x
            );

        // 1
        const shaders = await Promise.all(
            Object.entries(shaderOptions.shaders)
                .map(([name, url]) =>
                    safeFetch(absUrl(makeResourceUrl(url)))
                        .then(res => res.text())
                        .then(res => [name, res])
                )
        );

        // 2
        const uniforms = Object
            .entries(shaderOptions.uniforms)
            .reduce((acc, [name, value]) => ({ ...acc, [name]: { type: 'i', value } }), {});
        this.uniforms = {
            time: { type: "f", value: 0.0 },
            resolution: { type: "v2", value: new THREE.Vector2() },
            ...uniforms,
        };

        // 3
        Object.entries(shaderOptions.textures)
            .forEach(([name, url]) => {
                const txurl = absUrl(makeResourceUrl(url));
                const texture = new THREE.TextureLoader().load(txurl);
                // texture.wrapS = THREE.RepeatWrapping;
                // texture.wrapT = THREE.RepeatWrapping;
                // texture.repeat.set(1, 1);
                this.uniforms[name] = { type: 't', value: texture };
            });

        const pixelRatio = this.pixelRatio;
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.appendChild(this.renderer.domElement);

        this.uniforms.resolution.value.x = this.width * pixelRatio;
        this.uniforms.resolution.value.y = this.height * pixelRatio;

        const passes = shaders
            .reduce((acc, [name, shader], i) => ({
                ...acc,
                [name]: {
                    fragmentShader: shader,
                    uniforms: { ...this.uniforms },
                }
            }), {});
        console.log('[init]', shaders, passes);
        this.multipassRenderer = new MultiPostFX({ renderer: this.renderer, passes: passes });

        console.log(this);
        this.runAnimation();
    }

    constructor() {
        super();
        console.log('[nftfx.init] 1');
        this.style.width = `${this.width}px`;
        this.style.height = `${this.height}px`;
        this.style.display = `block`;
        if (this.url) {
            this.metadata = safeFetch(this.url, 'json');
        } else {
            this.metadata = Promise.resolve(
                JSON.parse(this.querySelector('script[type="text/nftfx"]').textContent)
            );
        }
        this.init();
    }

    runAnimation() {
        if (this.autoplay)
            requestAnimationFrame(() => this.runAnimation());
        this.render();
    }

    render(doScreenshot = false) {
        if (this.uniforms) {
            const elapsedMilliseconds = Date.now() - this.startTime;
            const elapsedSeconds = elapsedMilliseconds / 1000.;
            this.uniforms.time.value = elapsedSeconds; // 60. * 

            // Object.entries(this.multipassRenderer.passes).forEach(([name, pass]) => {
            // })

            // this.renderer.render(this.scene, this.camera);
            this.multipassRenderer.render();
        }
        if (doScreenshot) {
            return this.renderer.domElement.toDataURL();
        }
    }

}
