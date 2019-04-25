import search from './search.html'
import Component from '../component.js'
import {addClass, removeClass} from '../template_utils.js'
import Logger from '../logger.js'

const logger = Logger.create('Search') // eslint-disable-line no-unused-vars

const empty = {addresses: [], transactions: []}
const numShowResults = 10

const byPrefix = term => addr => addr.startsWith(term)

export default class Search extends Component {
  constructor (dispatcher, keyspaces) {
    super()
    this.keyspaces = keyspaces
    this.dispatcher = dispatcher
    this.term = ''
    this.resultTerm = ''
    this.clearResults()
  }
  clearResults () {
    this.result = {}
    for (let keyspace in this.keyspaces) {
      this.result[keyspace] = {...empty}
    }
  }
  clear () {
    this.clearResults()
    this.term = ''
    this.isLoading = false
    this.setUpdate(true)
  }
  error (keyspace, msg) {
    this.result[keyspace].error = msg
    this.setUpdate('result')
  }
  showLoading () {
    if (!this.isLoading) {
      this.isLoading = true
      this.setUpdate('result')
    }
  }
  hideLoading () {
    if (this.isLoading) {
      this.isLoading = false
      this.setUpdate('result')
    }
  }
  renderLoading () {
    if (this.isLoading) {
      // removeClass(this.root.querySelector('#browser-search-result'), 'hidden')
      this.root.querySelector('#indicator').style.display = 'inline'
    } else {
      // addClass(this.root.querySelector('#browser-search-result'), 'hidden')
      this.root.querySelector('#indicator').style.display = 'none'
    }
  }
  render (root) {
    if (root) this.root = root
    if (!this.root) throw new Error('root not defined')
    if (!this.shouldUpdate()) return
    logger.debug('shouldupdate', this.shouldUpdate('term'))
    if (this.shouldUpdate(true)) {
      super.render()
      this.root.innerHTML = search
      this.input = this.root.querySelector('textarea')
      this.renderTerm()
      this.form = this.root.querySelector('form')
      this.form.addEventListener('submit', (e) => {
        e.returnValue = false
        e.preventDefault()
        for (let keyspace in this.result) {
          if (this.result[keyspace].addresses.length > 0) {
            let addresses = this.result[keyspace].addresses.filter(byPrefix(this.term))
            this.dispatcher('clickSearchResult', {id: addresses[0], type: 'address', keyspace})
            return false
          }
        }
        this.term.split('\n').forEach((address) => {
          for (let keyspace in this.keyspaces) {
            this.dispatcher('clickSearchResult', {id: address, type: 'address', keyspace})
          }
        })
        return false
      })
      this.input.addEventListener('keypress', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        this.form.querySelector('button[type=\'submit\']').click()
      })
      this.input.addEventListener('input', (e) => {
        this.dispatcher('search', e.target.value)
      })
      this.input.addEventListener('blur', () => {
      // wrap in timeout to let possible clicksearchresult event happen
        setTimeout(() => this.dispatcher('blurSearch'), 200)
      })
      this.renderResult()
      return this.root
    }
    if (this.shouldUpdate('result')) {
      this.renderResult()
    }
    if (this.shouldUpdate('term')) {
      this.renderTerm()
    }
    super.render()
    return this.root
  }
  renderTerm () {
    logger.debug('renderTerm')
    if (!this.input) return
    this.input.value = this.term
    let lines = this.term.split('\n')
    if (lines.length === 1) {
      this.input.style.height = '100%'
      return
    }
    this.input.style.height = (lines.length + 1) * 1.13 + 'em'
  }
  setSearchTerm (term, prefixLength) {
    this.term = term.split('\n').filter(line => line).join('\n')
    this.setUpdate('result')
    this.setUpdate('term')
    if (this.term.length < prefixLength) {
      this.clearResults()
    }
  }
  isMultiline () {
    return this.term.indexOf('\n') !== -1
  }
  needsResults (keyspace, limit, prefixLength) {
    if (this.isMultiline()) return false
    if (this.term.length < prefixLength) return false
    let len = (this.result[keyspace].addresses || []).length
    return !(len !== 0 && len < limit && this.term.startsWith(this.resultTerm))
  }
  renderOptions () {
    return null
  }

  renderResult () {
    logger.debug('addresses', this.result)
    let frame = this.root.querySelector('#browser-search-result')
    let el = frame.querySelector('#result')
    el.innerHTML = ''

    let visible = this.isLoading
    let allErrors = true
    for (let keyspace in this.keyspaces) {
      visible = visible ||
        this.result[keyspace].error ||
        this.result[keyspace].addresses.length > 0 ||
        this.result[keyspace].transactions.length > 0
      if (this.result[keyspace].error) {
        continue
      }
      allErrors = false

      let ul = document.createElement('ol')
      ul.className = 'list-reset'
      let count = 0
      this.result[keyspace].addresses
        .filter(byPrefix(this.term))
        .forEach(addr => {
          if (count > numShowResults) return
          count++
          let li = document.createElement('li')
          li.className = 'cursor-pointer'
          li.appendChild(document.createTextNode(addr))
          li.addEventListener('click', () => {
            this.dispatcher('clickSearchResult', {id: addr, type: 'address', keyspace})
          })
          ul.appendChild(li)
        })
      // if no results to render don't draw the title and the list at all
      if (count === 0) continue
      let title = document.createElement('div')
      title.className = 'font-bold py-1'
      title.appendChild(document.createTextNode(this.keyspaces[keyspace]))
      el.appendChild(title)
      el.appendChild(ul)
    }
    if (allErrors) {
      el.innerHTML = `Failed to fetch from any keyspaces`
      addClass(el, 'text-gs-red')
    } else {
      removeClass(el, 'text-gs-red')
    }
    logger.debug('isVisible', this.isLoading, visible)
    if (visible) {
      addClass(frame, 'block')
      removeClass(frame, 'hidden')
    } else {
      removeClass(frame, 'block')
      addClass(frame, 'hidden')
    }
    this.renderLoading()
  }
  setResult (term, result) {
    if (term !== this.term) return
    this.result[result.keyspace] = {
      addresses: result.addresses,
      transactions: result.transactions
    }
    this.resultTerm = term
    this.setUpdate('result')
  }
}
