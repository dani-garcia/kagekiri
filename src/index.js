import postcssSelectorParser from 'postcss-selector-parser'
const parser = postcssSelectorParser()

function addAll (arr1, arr2) {
  for (let item of arr2) {
    arr1.push(item)
  }
}

function getAllElements (context) {
  const results = []

  // create the results list in depth-first order
  for (let element of context.querySelectorAll('*')) {
    results.push(element)
    if (element.shadowRoot) {
      addAll(results, getAllElements(element.shadowRoot))
    }
  }
  return results
}

// given a list of ast nodes, find the final list and stop when hitting
// a combinator. for instance "div span > button span strong.foo" should return "strong.foo"
function getLastNonCombinatorNodes (nodes) {
  let results = []
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    if (node.type === 'combinator') {
      break
    }
    results.push(node)
  }
  return results.reverse()
}

function getParentIgnoringShadow (element) {
  if (element.parentElement) {
    return element.parentElement
  }
  const rootNode = element.getRootNode()
  if (rootNode !== document) {
    return rootNode.host
  }
}

function getFirstMatchingAncestor (element, nodes) {
  let ancestor = getParentIgnoringShadow(element)
  while (ancestor) {
    if (matches(ancestor, { nodes })) {
      return ancestor
    }

    ancestor = getParentIgnoringShadow(ancestor)
  }
}

function getFirstMatchingPreviousSibling (element, nodes) {
  let sibling = element.previousElementSibling
  while (sibling) {
    if (matches(sibling, { nodes })) {
      return sibling
    }
    sibling = sibling.previousElementSibling
  }
}

function matches (element, ast) {
  let { nodes } = ast
  for (let i = nodes.length - 1; i >= 0; i--) {
    let node = nodes[i]
    if (node.type === 'class') {
      if (!element.classList.contains(node.value)) {
        return false
      }
    } else if (node.type === 'tag') {
      if (element.tagName.toLowerCase() !== node.value.toLowerCase()) {
        return false
      }
    } else if (node.type === 'attribute') {
      if (node.value) { // e.g. [data-foo="bar"]
        if (element.getAttribute(node.attribute) !== node.value) {
          return false
        }
      } else { // e.g. [data-foo]
        if (!element.hasAttribute(node.attribute)) {
          return false
        }
      }
    } else if (node.type === 'pseudo' && node.value === ':not') {
      // not sure why a :not() can have multiple nodes here, but let's test them all
      for (let subNode of node.nodes) {
        if (matches(element, subNode)) {
          return false
        }
      }
    } else if (node.type === 'combinator') {
      if (node.value === ' ') {
        // walk all ancestors
        const precedingNodes = getLastNonCombinatorNodes(nodes.slice(0, i))
        const ancestor = getFirstMatchingAncestor(element, precedingNodes)
        if (!ancestor) {
          return false
        } else {
          element = ancestor
          i -= precedingNodes.length
        }
      } else if (node.value === '>') {
        // walk immediate parent only
        const precedingNodes = getLastNonCombinatorNodes(nodes.slice(0, i))
        const ancestor = getParentIgnoringShadow(element)
        if (!ancestor || !matches(ancestor, { nodes: precedingNodes })) {
          return false
        } else {
          element = ancestor
          i -= 1
        }
      } else if (node.value === '+') {
        // walk immediate sibling only
        const precedingNodes = getLastNonCombinatorNodes(nodes.slice(0, i))
        const sibling = element.previousElementSibling
        if (!sibling || !matches(sibling, { nodes: precedingNodes })) {
          return false
        } else {
          i -= precedingNodes.length
        }
      } else if (node.value === '~') {
        // walk all previous siblings
        const precedingNodes = getLastNonCombinatorNodes(nodes.slice(0, i))
        const sibling = getFirstMatchingPreviousSibling(element, precedingNodes)
        if (!sibling) {
          return false
        } else {
          i -= precedingNodes.length
        }
      }
    }
  }
  return true
}

function getMatchingElements (elements, ast) {
  const results = []
  for (let element of elements) {
    for (let node of ast.nodes) { // multiple nodes here are comma-separated
      if (matches(element, node)) {
        results.push(element)
      }
    }
  }
  return results
}

function querySelector (selector, context = document) {
  return querySelectorAll(selector, context)[0]
}

function querySelectorAll (selector, context = document) {
  const ast = parser.astSync(selector)
  // TODO: optimization: don't get all elements, only the ones that match the last relevant selector,
  // e.g. for "foo bar baz" just search for "baz"
  const elements = getAllElements(context)

  return getMatchingElements(elements, ast)
}

export {
  querySelectorAll,
  querySelector
}