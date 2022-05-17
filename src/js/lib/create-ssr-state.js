import {
    createStore as createReduxStore,
    applyMiddleware,
    compose,
    combineReducers,
} from 'redux'
import thunk from 'redux-thunk'
import { composeWithDevTools } from 'redux-devtools-extension/developmentOnly'

import { ReduxEvents } from 'redux-events-middleware'
import { createSSRContext } from './create-ssr-context'

import {
    getReducers as getFeaturesReducers,
    decorateStore as decorateStoreWithFeatures,
} from 'react-redux-feature/lib/decorate-store'

const defaultSettings = {
    // customize middlewares
    prependMiddlewares: [],
    appendMiddlewares: [],
    buildMiddlewares: $ => $,

    // customize enhanders
    prependEnhancers: [],
    appendEnhancers: [],
    buildEnhancers: $ => $,

    // customize reducers
    appendReducers: {},

    // other stuff
    globalStoreName: 'store',

    // allow to manipulate the output of the function
    // es, connect history to redux and so on.
    out: $ => $,
}

export const createSSRState = (appReducers = {}, receivedFeatures = [], receivedSettings = {}) =>
    async (initialState = {}, history = null) => {
        const IS_BROWSER = typeof window !== 'undefined'

        // accepts empty features
        const appFeatures = receivedFeatures.map(feature => ({
            reducers: feature.reducers || {},
            services: feature.services || [],
            listeners: feature.listeners || [],
        }))

        const settings = {
            ...defaultSettings,
            ...receivedSettings,
        }

        const events = new ReduxEvents()
        const ssrContext = createSSRContext({
            ...(initialState.ssr || {}),
            history,
        })

        const basicMiddlewares = [
            thunk,
            // routerMiddleware(history),
            events.createReduxMiddleware({ history }),
        ]

        // @DEV: redux dev tools (development & client only)
        let composeEnhancer
        const basicEnhancers = []
        if (IS_BROWSER) {
            composeEnhancer = composeWithDevTools({ trace: true, traceLimit: 25 })
        } else {
            composeEnhancer = compose
        }

        const middlewares = settings.buildMiddlewares([
            ...settings.prependMiddlewares,
            ...basicMiddlewares,
            ...settings.appendMiddlewares,
        ])

        const enhancers = settings.buildEnhancers([
            ...settings.prependEnhancers,
            ...basicEnhancers,
            ...settings.appendEnhancers,
        ])

        const composedEnhancers = composeEnhancer(
            applyMiddleware(...middlewares),
            ...enhancers,
        )

        const initialReducers = {
            ...appReducers,
            ...getFeaturesReducers(appFeatures),
            ...ssrContext.reducers,
            ...settings.appendReducers,
        }

        const combinedReducers = combineReducers(initialReducers)

        // redux store gets created
        let store = createReduxStore(
            combinedReducers,
            initialState,
            composedEnhancers,
        )

        // react-redux-features
        // add features capabilities to the store
        store = decorateStoreWithFeatures({ store, history, events, initialReducers })

        // Initialize dynamic stuff
        await store.registerSyncFeatures(appFeatures)
        // @TODO: what the hell???
        // await new Promise(resolve => setTimeout(resolve, 200))
        await store.startSyncFeatures()

        // @DEV: expose the store for the console to dispatch actions
        if (IS_BROWSER && process.env.NODE_ENV === 'development') {
            window[settings.globalStoreName] = store
        }

        return settings.out({
            store,
            history,
            events,
            ssrContext,
        })
    }

export default createSSRState