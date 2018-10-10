import './style.css'
import '@fortawesome/fontawesome-free/css/all.css'
import {dispatch} from './dispatch.js'
import Browser from './browser.js'
import Rest from './rest.js'
import Layout from './layout.js'
import Store from './store.js'
import NodeGraph from './nodeGraph.js'

const dispatcher = dispatch(IS_DEV,
  'search',
  'searchresult',
  'addAddress',
  'loadAddress',
  'loadClusterForAddress',
  'loadOutgoingTxs',
  'loadIncomingTxs',
  'loadTags',
  'resultAddress',
  'resultClusterForAddress'
)
const baseUrl = 'http://localhost:8000'

let store = new Store()

let browser = new Browser(dispatcher, store)

let graph = new NodeGraph(dispatcher, store)

let rest = new Rest(dispatcher, baseUrl)

let layout = new Layout(dispatcher, browser, graph)
document.body.append(layout.render())

if (module.hot) {
  module.hot.accept(['./browser.js', './browser/search.js', './browser/search.html', './browser/address.js', './browser/address.html'], () => {
    console.log('Updating browser module')
    dispatcher.on('.browser', null)
    browser = new Browser(dispatcher, store)
    layout.setBrowser(browser)
    dispatcher.replay('browser')
  })
  module.hot.accept(['./nodeGraph.js', './nodeGraph/layer.js', './nodeGraph/clusterNode.js'], () => {
    console.log('Updating graph module')
    dispatcher.on('.graph', null)
    graph = new NodeGraph(dispatcher, store)
    layout.setGraph(graph)
    dispatcher.replay('graph')
  })
  module.hot.accept('./rest.js', () => {
    console.log('Updating rest module')
    rest = new Rest(dispatcher, baseUrl)
    dispatcher.replay('rest')
  })
}
