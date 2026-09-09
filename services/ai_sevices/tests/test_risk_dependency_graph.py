import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from app.services.risk import dependency_graph as dg


def test_add_edge_requires_both_nodes_to_exist():
    g = dg.DependencyGraph()
    g.add_node(dg.GraphNode(dg.node_id("asset", "a"), "asset", "A"))
    try:
        g.add_edge(dg.node_id("asset", "a"), dg.node_id("asset", "missing"))
        assert False, "expected KeyError"
    except KeyError:
        pass


def test_bfs_reachable_walks_multiple_hops_forward_out_direction():
    g = dg.DependencyGraph()
    biz = dg.node_id("business_service", "svc")
    asset = dg.node_id("asset", "a")
    finding = dg.node_id("finding", "f")
    for n, t, label in [(biz, "business_service", "Svc"), (asset, "asset", "A"), (finding, "finding", "F")]:
        g.add_node(dg.GraphNode(n, t, label))
    g.add_edge(asset, biz)
    g.add_edge(finding, asset)

    # "out" walks forward along the graph's convention (specific node ->
    # thing it affects): finding -> asset -> business_service.
    reached = g.bfs_reachable(finding, direction="out")
    reached_ids = {n.id for n, _ in reached}
    assert asset in reached_ids
    assert biz in reached_ids


def test_bfs_reachable_direction_in_walks_backward_to_causes():
    g = dg.DependencyGraph()
    biz = dg.node_id("business_service", "svc")
    asset = dg.node_id("asset", "a")
    finding = dg.node_id("finding", "f")
    for n, t, label in [(biz, "business_service", "Svc"), (asset, "asset", "A"), (finding, "finding", "F")]:
        g.add_node(dg.GraphNode(n, t, label))
    g.add_edge(asset, biz)
    g.add_edge(finding, asset)

    # From business_service, "in" walks backward to upstream causes:
    # asset, then finding.
    reached = g.bfs_reachable(biz, direction="in")
    reached_ids = {n.id for n, _ in reached}
    assert asset in reached_ids
    assert finding in reached_ids


def test_affected_business_services_finds_demo_graph_service():
    g = dg.build_demo_graph()
    threat_id = dg.node_id("threat", "credential-stuffing-campaign")
    services = dg.affected_business_services(g, threat_id)
    assert len(services) == 1
    assert services[0]["label"] == "Customer Payments"
    assert services[0]["criticality"] == 0.91


def test_affected_business_services_empty_for_unknown_start():
    g = dg.build_demo_graph()
    services = dg.affected_business_services(g, dg.node_id("threat", "does-not-exist"))
    assert services == []


def test_neighbors_out_is_the_reverse_direction_of_neighbors_in():
    g = dg.DependencyGraph()
    a = dg.node_id("asset", "a")
    b = dg.node_id("business_service", "b")
    g.add_node(dg.GraphNode(a, "asset", "A"))
    g.add_node(dg.GraphNode(b, "business_service", "B"))
    g.add_edge(a, b)
    assert [n.id for n in g.neighbors_out(a)] == [b]
    assert [n.id for n in g.neighbors_in(b)] == [a]
