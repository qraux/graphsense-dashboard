import {map} from 'd3-collection'
import Logger from './logger.js'
import moment from 'moment'

const logger = Logger.create('Store') // eslint-disable-line no-unused-vars

const sep = '|'

const prefix = (keyspace, id) => {
  return keyspace + sep + id
}
const unprefix = (idPrefixed) => {
  let pos = idPrefixed.indexOf(sep)
  if (pos === -1) return [null, idPrefixed]
  return [idPrefixed.substring(0, pos), idPrefixed.substring(pos + 1)]
}

export default class Store {
  constructor () {
    this.addresses = map()
    this.entities = map()
    this.outgoingLinks = map()
    this.notesStore = map()
    this.tagsStore = map()
  }
  /**
   * Adds an object to store if it does not exist
   */
  add (object) {
    let empty = {}
    let idPrefixed = null
    let id = null
    let type = null
    logger.debug('add', JSON.stringify(object))
    if (object.address || object.type === 'address') {
      id = object.address ? object.address : object.id
      type = 'address'
    } else if (object.entity || object.type === 'entity') {
      id = object.entity ? object.entity : object.id
      type = 'entity'
    } else {
      logger.error('invalid object, cannot determine type', object)
      return
    }
    if (!object.keyspace) {
      logger.error('invalid object, no keyspace/currency', object)
      return
    }
    idPrefixed = prefix(object.keyspace, id)
    if (idPrefixed && type === 'address') {
      let a = this.addresses.get(idPrefixed)
      if (!a) {
        a = empty
        a.id = id
        a.type = 'address'
        let outgoing = this.initOutgoing(id, object.keyspace)
        a.outgoing = outgoing
        this.addresses.set(idPrefixed, a)
        a.notes = this.notesStore.get('address' + idPrefixed)
      }
      // merge new object into existing one
      Object.keys(object).forEach(key => { a[key] = object[key] })

      // add existing tags eventually
      a.tags = (a.tags || []).concat(this.tagsStore.get(idPrefixed) || [])
      this.tagsStore.remove(idPrefixed)

      logger.debug('added', a)
      // remove unneeded address field (is now id)
      delete a.address
      if (typeof object.entity === 'string' || typeof object.entity === 'number') object.toEntity = object.entity
      if (object.toEntity) {
        let cidPrefixed = prefix(object.keyspace, object.toEntity)
        let c = this.entities.get(cidPrefixed)
        if (!c) {
          c = { addresses: map(), id: object.toEntity, type: 'entity', ...empty }
          let outgoing = this.initOutgoing(id, object.keyspace)
          c.outgoing = outgoing
          this.entities.set(cidPrefixed, c)
        }
        c.addresses.set(a.id, a)
        a.entity = c
      }
      return a
    } else if (idPrefixed && type === 'entity') {
      let c = this.entities.get(idPrefixed)
      if (!c) {
        c = { addresses: map(), ...empty }
        c.id = id
        c.type = 'entity'
        let outgoing = this.initOutgoing(id, object.keyspace)
        c.outgoing = outgoing
        this.entities.set(idPrefixed, c)
        c.notes = this.notesStore.get('entity' + idPrefixed)
      }
      // merge new object into existing one
      Object.keys(object).forEach(key => { c[key] = object[key] })
      // remove unneeded entity field (is now id)
      delete c.entity
      let addresses = object.forAddresses || []
      addresses.forEach(address => {
        let a = this.addresses.get(prefix(object.keyspace, address))
        logger.debug('forAddress', address, a)
        if (a) {
          c.addresses.set(address, a)
          a.entity = c
        }
      })
      return c
    }
  }
  get (keyspace, type, key) {
    let store = null
    if (type === 'address') {
      store = this.addresses
    } else if (type === 'entity') {
      store = this.entities
    }
    if (!store) {
      logger.error('unknown type ' + type)
      return
    }
    return store.get(prefix(keyspace, key))
  }
  find (key, type) {
    let found = null
    let findIt = node => {
      if (!found && node.id == key) found = node // eslint-disable-line eqeqeq
    }
    if (type === 'address') {
      this.addresses.each(findIt)
    } else if (type === 'entity') {
      this.entities.each(findIt)
    } else {
      this.addresses.each(findIt)
      if (!found) this.entities.each(findIt)
    }
    return found
  }
  initOutgoing (id, keyspace) {
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new Error('id is not string')
    }
    let outgoing = this.outgoingLinks.get(prefix(keyspace, id))
    if (!outgoing) {
      outgoing = map()
      this.outgoingLinks.set(prefix(keyspace, id), outgoing)
    }
    return outgoing
  }
  linkOutgoing (source, target, keyspace, data) {
    let outgoing = this.initOutgoing(source, keyspace)
    let n = outgoing.get(target)
    if (!n && (!data || !data.no_txs || !data.estimated_value)) {
      outgoing.set(target, null)
      return
    }
    if (!data) return
    outgoing.set(target, {
      no_txs: data.no_txs,
      estimated_value: data.estimated_value
    })
  }
  serialize () {
    let addresses = []
    this.addresses.each(address => {
      let s = {...address}
      s.entity = s.entity.id
      delete s.outgoing
      addresses.push(s)
    })
    let entities = []
    this.entities.each(entity => {
      let s = {...entity}
      s.addresses = s.addresses.keys()
      delete s.outgoing
      entities.push(s)
    })
    let alllinks = []
    this.outgoingLinks.each((links, id) => {
      alllinks.push([id, links.entries()])
    })
    return [addresses, entities, alllinks]
  }
  serializeNotes () {
    let addresses = []
    this.addresses.each(address => {
      let s = [prefix(address.keyspace, address.id), address.notes]
      addresses.push(s)
    })
    let entities = []
    this.entities.each(entity => {
      let s = [prefix(entity.keyspace, entity.id), entity.notes]
      entities.push(s)
    })
    return [addresses, entities]
  }
  getNotes () {
    let tags = []
    this.addresses.each(address => {
      if (!address.notes) return
      tags.push({
        address: address.id,
        currency: address.keyspace.toUpperCase(),
        note: address.notes
      })
    })
    this.entities.each(entity => {
      if (!entity.notes) return
      tags.push({
        entity: entity.id,
        currency: entity.keyspace.toUpperCase(),
        note: entity.notes
      })
    })
    return tags
  }
  addNotes (tags) {
    tags.forEach(tag => {
      if (!tag.note) return
      let keyspace = tag.currency.toLowerCase()
      let idPrefixed = prefix(keyspace, tag.address)
      if (this.addresses.get(idPrefixed)) {
        this.add({keyspace, id: tag.address, notes: tag.note, type: 'address'})
      } else {
        this.notesStore.set('address' + idPrefixed, tag.note)
      }
    })
  }
  addTagpack (keyspaces, data) {
    let overwritable = ['address', 'label', 'source', 'currency', 'source', 'category', 'lastmod']
    let addressTags = map()
    data.tags.forEach(tag => {
      overwritable.forEach(key => {
        if (!tag[key]) tag[key] = data[key] || tag[key]
      })
      tag.lastmod = moment(tag.lastmod).unix()
      let tags = [tag]
      if (!tag.currency) {
        // if no currency given, assume all available keyspaces
        tags = keyspaces.map(keyspace => ({
          ...tag,
          currency: keyspace.toUpperCase()
        }))
      }
      tags.forEach(tag => {
        tag.keyspace = tag.currency.toLowerCase()
        let p = prefix(tag.keyspace, tag.address)
        let t = addressTags.get(p) || []
        t.push(tag)
        addressTags.set(p, t)
      })
    })
    addressTags.each((tags, p) => {
      let a = this.addresses.get(p)
      if (a) {
        a.tags = a.tags || []
        a.tags = a.tags.concat(tags)
      } else {
        let t = this.tagsStore.get(p) || []
        t = t.concat(tags)
        this.tagsStore.set(p, t)
      }
    })
  }
  deserialize (version, [addresses, entities, alllinks]) {
    entities.forEach(entity => {
      entity.forAddresses = entity.addresses
      delete entity.addresses
      this.add(entity)
    })
    addresses.forEach(address => {
      this.add(address)
    })
    alllinks.forEach(([id, links]) => {
      let sp = []
      if (version === '0.4.0') {
        let found = this.find(id)
        if (!found) return
        sp[0] = found.keyspace
        sp[1] = id
      } else {
        sp = unprefix(id)
      }
      links.forEach(({key, value}) => {
        this.linkOutgoing(sp[1], key, sp[0], value)
      })
    })
  }
  deserializeNotes (version, [addressNotes, entityNotes]) {
    let ser = (nodes, type) => ([idPrefixed, notes]) => {
      let c = nodes.get(idPrefixed)
      let unprefixed = unprefix(idPrefixed)
      if (c) {
        this.add({keyspace: unprefixed[0], id: unprefixed[1], notes, type})
      } else {
        this.notesStore.set(type + idPrefixed, notes)
      }
    }
    entityNotes.forEach(ser(this.entities, 'entity'))
    addressNotes.forEach(ser(this.addresses, 'address'))
  }
  allAddressTags () {
    let tags = []
    this.addresses.each((address) => {
      if (!address.tags) return
      tags = tags.concat(address.tags)
    })
    return tags
  }
}
