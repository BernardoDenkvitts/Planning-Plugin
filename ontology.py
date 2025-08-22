import re
from rdflib import Graph, Namespace, URIRef, Literal
from rdflib.namespace import RDF, RDFS
import pyodide.http

class PDDLParser:
    def __init__(self, domain_text: str, problem_text: str):
        self.domain_text = self._remove_pddl_comments(domain_text)
        self.problem_text = self._remove_pddl_comments(problem_text)
        self.data = {}
        self.df = DomainFunctions()
        self.pf = ProblemFunctions()

    def run(self) -> dict:
        self._parse_domain()
        self._parse_problem()
        return self.data

    def _parse_domain(self):
        name = self.df.get_domain_name(self.domain_text).strip()

        self.data.setdefault(name, {})
        self.data[name]["requirements"] = self.df.get_requirements(self.domain_text) if '(:requirements' in self.domain_text else []
        self.data[name]["types"] = self.df.get_types(self.domain_text) if '(:types' in self.domain_text else {}
        self.data[name]["constants"] = self.df.get_constants(self.domain_text) if '(:constants' in self.domain_text else {}
        self.data[name]["predicates"] = self.df.get_predicates(self.domain_text) if '(:predicates' in self.domain_text else []
        self.data[name]["actions"] = self.df.get_actions(self.domain_text) if '(:action' in self.domain_text else {}

        self.domain_name = name

    def _parse_problem(self):
        problem_name, _ = self.pf.get_problem_name(self.problem_text)
        problem_name = problem_name.strip()
        
        objects = self.pf.get_objects(self.problem_text) if '(:objects' in self.problem_text else []
        init = self.pf.get_initialState(self.problem_text) if '(:init' in self.problem_text else {}
        goal = self.pf.get_goalState(self.problem_text) if '(:goal' in self.problem_text else []

        self.data[self.domain_name].setdefault("Problems", {})
        self.data[self.domain_name]["Problems"][problem_name] = {
            "objects": objects,
            "init": init,
            "goal": goal
        }

    def _remove_pddl_comments(self, text: str) -> str:
        text = re.sub(r";.*$", "", text, flags=re.MULTILINE)
        text = re.sub(r"[ \t]+", " ", text)
        text = "\n".join(line for line in text.splitlines() if line.strip())
        return text

class OntologyBuilder:
    
    def __init__(self, graph):
        self.g = graph
        self.planOntology = Namespace('https://purl.org/ai4s/ontology/planning#')

    def build_from_dict(self, data: dict) -> str:
        for domain_instance in data:
            itemURI = URIRef(self.planOntology + self.iri_safe(domain_instance))
            self.g.add((itemURI, RDF.type, self.planOntology.domain))
            self.g.add((itemURI, RDFS.label, Literal(domain_instance)))

            for domain_instance_property in data[domain_instance]:
                class_name, property_name = self.get_class_name(domain_instance_property)
                values = data[domain_instance][domain_instance_property]

                if domain_instance_property == 'requirements':
                    self.add_requirements(class_name, property_name, itemURI, values)

                elif domain_instance_property == 'types':
                    self.add_types(class_name, property_name, itemURI, values)

                elif domain_instance_property == 'constants':
                    self.add_constants(class_name, property_name, itemURI, values)

                elif domain_instance_property == 'predicates':
                    self.add_predicates(class_name, property_name, itemURI, values)

                elif domain_instance_property == 'actions':
                    self.add_actions(class_name, property_name, itemURI, values)

                elif domain_instance_property == 'Problems':
                    self.add_problem(class_name, property_name, itemURI, values)

        owl_bytes = self.g.serialize(format="application/rdf+xml", encoding="utf-8")
        owl_string = owl_bytes.decode("utf-8")
        return owl_string

    def iri_safe(self, local):
        # Sanitize a raw PDDL token so it can be safely used as part of an IRI.
        local = re.sub(r"\s+", "_", local.strip())
        local = re.sub(r"[^\w\-\.]", "_", local)
        return local

    def get_class_name(self, input_string):
        po = self.planOntology
        return {
            'requirements': (po.requirement, po.hasRequirement),
            'types':        (po.type, po.hasType),
            'constants':    (po.constant, po.hasConstant),
            'predicates':   (po.predicate, po.hasPredicate),
            'actions':      (po.action, po.hasMove),
            'Problems':     (po.problem, po.hasProblem)
        }.get(input_string, (None, None))

    def add_requirements(self, class_name, property_name, itemURI, data):
        for value in data:
            value_URI = URIRef(self.planOntology + self.iri_safe(value))
            self.g.add((value_URI, RDF.type, class_name))
            self.g.add((value_URI, RDFS.label, Literal(value)))
            self.g.add((itemURI, property_name, value_URI))

    def add_types(self, class_name, property_name, itemURI, data):
        if isinstance(data, dict):
            for tag, values in data.items():
                tag_URI = URIRef(self.planOntology + self.iri_safe(value))
                self.g.add((tag_URI, RDF.type, self.planOntology.type_tag))
                self.g.add((tag_URI, RDFS.label, Literal(tag)))
                for value in values:
                    value_URI = URIRef(self.planOntology + self.iri_safe(value))
                    self.g.add((value_URI, RDF.type, class_name))
                    self.g.add((value_URI, RDFS.label, Literal(value)))
                    self.g.add((value_URI, self.planOntology.hasTag, tag_URI))
                    self.g.add((itemURI, property_name, value_URI))
        else:
            for value in data:
                value_URI = URIRef(self.planOntology + self.iri_safe(value))
                self.g.add((value_URI, RDF.type, class_name))
                self.g.add((value_URI, RDFS.label, Literal(value)))
                self.g.add((itemURI, property_name, value_URI))

    def add_constants(self, class_name, property_name, itemURI, data):
        if isinstance(data, dict):
            for values in data.values():
                for value in values:
                    value_URI = URIRef(self.planOntology + self.iri_safe(value))
                    self.g.add((value_URI, RDF.type, class_name))
                    self.g.add((value_URI, RDFS.label, Literal(value)))
                    self.g.add((itemURI, property_name, value_URI))
        else:
            for value in data:
                value_URI = URIRef(self.planOntology + self.iri_safe(value))
                self.g.add((value_URI, RDF.type, class_name))
                self.g.add((value_URI, RDFS.label, Literal(value)))
                self.g.add((itemURI, property_name, value_URI))

    def add_predicates(self, class_name, property_name, itemURI, data):
        for i, value in enumerate(data, 1):
            value_URI = URIRef(self.planOntology + itemURI.split('#')[-1] + f'_predicate_{i}')
            self.g.add((value_URI, RDF.type, class_name))
            self.g.add((value_URI, RDFS.label, Literal(value)))
            self.g.add((itemURI, property_name, value_URI))

    def add_actions(self, class_name, property_name, itemURI, data):
        for action, items in data.items():
            action_URI = URIRef(self.planOntology + self.iri_safe(action))
            self.g.add((action_URI, RDF.type, class_name))
            self.g.add((action_URI, RDFS.label, Literal(action)))
            self.g.add((itemURI, property_name, action_URI))

            for key, value in items.items():
                if key == 'parameters':
                    self.add_parameters(self.planOntology.parameter, self.planOntology.hasParameter, action_URI, value)
                elif key == 'preconditions':
                    self.add_preconditions(self.planOntology.precondition, self.planOntology.hasPrecondition, action_URI, value)
                elif key == 'effect':
                    self.add_effects(self.planOntology.effect, self.planOntology.hasEffect, action_URI, value)

    def add_parameters(self, class_name, property_name, itemURI, data):
        values = data.get("values", [])
        types = data.get("types", [])

        for i, value in enumerate(values):
            value_URI = URIRef(self.planOntology + self.iri_safe(value))
            self.g.add((value_URI, RDF.type, class_name))
            self.g.add((value_URI, RDFS.label, Literal(value)))
            self.g.add((itemURI, property_name, value_URI))
            if i < len(types):
                type_URI = URIRef(self.planOntology + self.iri_safe(types[i]))
                self.g.add((type_URI, RDF.type, self.planOntology.type))
                self.g.add((type_URI, RDFS.label, Literal(types[i])))
                self.g.add((value_URI, self.planOntology.ofType, type_URI))

    def add_preconditions(self, class_name, property_name, itemURI, data):
        for i, value in enumerate(data, 1):
            uri = URIRef(self.planOntology + itemURI.split('#')[-1] + f'_precondition_{i}')
            self.g.add((uri, RDF.type, class_name))
            self.g.add((uri, RDFS.label, Literal(value)))
            self.g.add((itemURI, property_name, uri))

    def add_effects(self, class_name, property_name, itemURI, data):
        for i, value in enumerate(data, 1):
            uri = URIRef(self.planOntology + itemURI.split('#')[-1] + f'_effect_{i}')
            self.g.add((uri, RDF.type, class_name))
            self.g.add((uri, RDFS.label, Literal(value)))
            self.g.add((itemURI, property_name, uri))

    def add_problem(self, class_name, property_name, itemURI, data):
        for problem_name, items in data.items():
            problem_URI = URIRef(self.planOntology + problem_name)
            self.g.add((problem_URI, RDF.type, class_name))
            self.g.add((problem_URI, RDFS.label, Literal(problem_name)))
            self.g.add((itemURI, property_name, problem_URI))

            for key, value in items.items():
                if key == "objects":
                    self.add_objects(self.planOntology.object, self.planOntology.hasObject, problem_URI, itemURI.split('#')[-1], value)
                elif key == "init":
                    self.add_initial_state(self.planOntology.initial_state, self.planOntology.hasInitialState, problem_URI, value)
                elif key == "goal":
                    self.add_goal_state(self.planOntology.goal_state, self.planOntology.hasGoalState, problem_URI, value)

    def add_objects(self, class_name, property_name, itemURI, domain_name, data):
        if isinstance(data, dict):
            for obj_type, values in data.items():
                type_URI = URIRef(self.planOntology + obj_type)
                self.g.add((type_URI, RDF.type, self.planOntology.type))
                self.g.add((type_URI, RDFS.label, Literal(obj_type)))
                self.g.add((URIRef(self.planOntology + domain_name), self.planOntology.hasType, type_URI))
                for value in values:
                    value_URI = URIRef(self.planOntology + value)
                    self.g.add((value_URI, RDF.type, class_name))
                    self.g.add((value_URI, RDFS.label, Literal(value)))
                    self.g.add((itemURI, property_name, value_URI))
                    self.g.add((type_URI, self.planOntology.hasTypeInstance, value_URI))
        else:
            for value in data:
                value_URI = URIRef(self.planOntology + value)
                self.g.add((value_URI, RDF.type, class_name))
                self.g.add((value_URI, RDFS.label, Literal(value)))
                self.g.add((itemURI, property_name, value_URI))

    def add_initial_state(self, class_name, property_name, itemURI, data):
        for i, value in enumerate(data, 1):
            uri = URIRef(self.planOntology + itemURI.split('#')[-1] + f'_initial_state_{i}')
            self.g.add((uri, RDF.type, class_name))
            self.g.add((uri, RDFS.label, Literal(value)))
            self.g.add((itemURI, property_name, uri))

    def add_goal_state(self, class_name, property_name, itemURI, data):
        for i, value in enumerate(data, 1):
            uri = URIRef(self.planOntology + itemURI.split('#')[-1] + f'_goal_state_{i}')
            self.g.add((uri, RDF.type, class_name))
            self.g.add((uri, RDFS.label, Literal(value)))
            self.g.add((itemURI, property_name, uri))

class DomainFunctions():

    def __init__(self):
        pass

    def find_parens(self, s):
        toret = {}
        pstack = []
        flag = 0
        for i, c in enumerate(s):
            if flag == 1 and len(pstack) == 0:
                return toret
            if c == '(':
                pstack.append(i)
                flag = 1
            elif c == ')':
                toret[pstack.pop()] = i
        return toret


    def get_domain_name(self, text: str):
        for line in text.splitlines():
            if '(domain' in line.lower():
                ind = line.lower().index('(domain')
                domain_line = line[ind:].strip()
                match = re.search(r'\(domain\s+([^\s\)]+)', domain_line, flags=re.IGNORECASE)
                if match:
                    return match.group(1)
        return "unknown_domain"


    def get_requirements(self, text: str):
        requirement_index = text.index('(:requirements')
        present_text = text[requirement_index:requirement_index + self.find_parens(text[requirement_index:])[0]]
        return present_text.split()[1:]


    def get_types(self, text: str):
        predicate_index = text.index('(:types')
        predicate_closing_ind = self.find_parens(text[predicate_index:])[0]

        file_data = text[predicate_index+8: predicate_index + predicate_closing_ind]
        types_list = [item for item in file_data.split(' ') if item]

        objects = '-' in types_list
        types = {}
        temp_list = []
        flag = 1

        for item in types_list:
            if objects:
                if item == '-':
                    flag = 0
                    continue
                if flag:
                    temp_list.append(item.replace('\n', ''))
                else:
                    flag = 1
                    temp_item = item.replace('\n', '')
                    if temp_item not in types:
                        types[temp_item] = []
                    types[temp_item].extend(temp_list)
                    temp_list = []
            else:
                if flag:
                    types = []
                    flag = 0
                types.append(item.replace('\n', ''))

        return types


    def get_constants(self, text: str):
        predicate_index = text.index('(:constants')
        predicate_closing_ind = self.find_parens(text[predicate_index:])[0]

        file_data = text[predicate_index+8: predicate_index + predicate_closing_ind]
        constants_list = [item for item in file_data.split(' ') if item]

        has_types = '-' in constants_list
        constants = {}
        temp_list = []
        flag = 1

        for item in constants_list:
            if has_types:
                if item == '-':
                    flag = 0
                    continue
                if flag:
                    temp_list.append(item.replace('\n', ''))
                else:
                    flag = 1
                    temp_item = item.replace('\n', '')
                    if temp_item not in constants:
                        constants[temp_item] = []
                    constants[temp_item].extend(temp_list)
                    temp_list = []
            else:
                if flag:
                    constants = []
                    flag = 0
                constants.append(item.replace('\n', ''))

        return constants


    def get_predicates(self, text: str):
        predicate_index = text.index('(:predicates')
        predicate_closing_ind = self.find_parens(text[predicate_index:])[0]

        file_data = text[predicate_index: predicate_index + predicate_closing_ind+1]
        predicates_list = []

        for ind in range(1, len(file_data)):
            if file_data[ind] == "(":
                closing_ind = self.find_parens(file_data[ind:])[0]
                present_text = file_data[ind: ind + closing_ind + 1]
                predicates_list.append(present_text)

        return predicates_list


    def get_params(self, data: str):
        params_index = data.index(':parameters')    
        index_dict = self.find_parens(data[params_index:])
        data = data[params_index:]

        start_ind = list(index_dict.keys())[0]
        closing_ind = index_dict[start_ind]

        data_string = re.split(" +", data[start_ind+1:closing_ind].replace('-', ''))

        values = []
        types = []
        flag = 1
        count = 1
        for i in data_string:
            if '?' in i:
                values.append(i)
                if flag == 0:
                    count += 1
                flag = 0
            else:
                for c in range(count):
                    types.append(i)
                flag = 1

        return {
            "parameters": {
                "values": values,
                "types": types
            }
        }

    def get_preconditions(self, data: str):
        index = data.index(':precondition')    
        index_dict = self.find_parens(data[index:])
        data = data[index:]

        ind_list = sorted(list(index_dict.keys()))

        if "and" in data[ind_list[0]:ind_list[0]+4]:
            ind_list = ind_list[1:]
            
        preconditions = []
        previous_ind = -1
        for ind in ind_list:
            if ind > previous_ind:
                preconditions.append(data[ind: index_dict[ind]+1])
                previous_ind = index_dict[ind]+1

        return preconditions

    def get_effect(self, data: str):
        index = data.index(':effect')    
        index_dict = self.find_parens(data[index:])
        data = data[index:]

        ind_list = sorted(list(index_dict.keys()))[1:]

        if "and" in data[ind_list[0]:ind_list[0]+4]:
            ind_list = ind_list[1:]

        effect = []
        previous_ind = -1
        for ind in ind_list:
            if ind > previous_ind:
                effect.append(data[ind: index_dict[ind]+1])
                previous_ind = index_dict[ind]+1

        return effect

    def get_actions(self, text: str):
        return_dict = {}
        list_of_action_index = [m.start() for m in re.finditer(r'\(:action', text)]

        for action_index in list_of_action_index:
            action_closing_ind = self.find_parens(text[action_index:])[0]
            temp_data = text[action_index: action_index + action_closing_ind + 1]

            action_name = str(temp_data.split('\n')[0]).split(' ')[-1]
            parameters = self.get_params(temp_data)
            preconditions = self.get_preconditions(temp_data)
            effect = self.get_effect(temp_data)

            return_dict[action_name] = {
                "parameters": parameters["parameters"],
                "preconditions": preconditions,
                "effect": effect
            }

        return return_dict

class ProblemFunctions():

    def __init__(self):
        pass

    def find_parens(self, s):
        toret = {}
        pstack = []
        flag = 0
        for i, c in enumerate(s):
            if flag == 1 and len(pstack) == 0:
                return toret
            if c == '(':
                pstack.append(i)
                flag = 1
            elif c == ')':
                toret[pstack.pop()] = i
        return toret

    def get_problem_name(self, text: str):
        content = re.sub(r'\s+', ' ', text)
        match = re.search(r'\(define\s*\(problem\s+([^\s\)]+)\)\s*\(:domain\s+([^\s\)]+)\)', content, flags=re.IGNORECASE)
        if match:
            problem_name = match.group(1).strip()
            domain_name = match.group(2).strip()
            return problem_name, domain_name
        return "unknown_problem", "unknown_domain"

    def get_objects(self, text: str):
        start_index = text.index('(:objects')
        closing_ind = self.find_parens(text[start_index:])[0]
        objects_text = text[start_index+10: start_index + closing_ind]
        instances_list = [item for item in objects_text.split(' ') if item]

        if '-' in instances_list:
            objects = True
        else:
            objects = False

        instances = {}
        temp_list = []
        flag = 1

        for item in instances_list:
            item = item.strip()
            if objects:
                if item == '-':
                    flag = 0
                    continue
                if flag:
                    temp_list.append(item.replace('\n', ''))
                else:
                    flag = 1
                    temp_item = item.replace('\n', '')
                    if temp_item not in instances:
                        instances[temp_item] = []
                    instances[temp_item].extend(temp_list)
                    temp_list = []
                    flag = 1
            else:
                if flag:
                    instances = []
                    flag = 0
                instances.append(item.replace('\n', ''))

        return instances

    def get_initialState(self, text: str):
        start_index = text.index('(:init')
        closing_idx = self.find_parens(text[start_index:])[0]
        block_text = text[start_index: start_index + closing_idx + 1]

        index_dict = self.find_parens(block_text)
        ind_list = sorted(list(index_dict.keys()))[1:]

        if "and" in block_text[ind_list[0]:ind_list[0]+4]:
            ind_list = ind_list[1:]

        states = []
        previous_ind = -1
        for ind in ind_list:
            if ind > previous_ind:
                states.append(block_text[ind: index_dict[ind]+1])
                previous_ind = index_dict[ind]

        return states

    def get_goalState(self, text: str):
        start_index = text.index('(:goal')
        closing_idx = self.find_parens(text[start_index:])[0]
        block_text = text[start_index: start_index + closing_idx + 1]

        index_dict = self.find_parens(block_text)
        ind_list = sorted(list(index_dict.keys()))[1:]

        if "and" in block_text[ind_list[0]:ind_list[0]+4]:
            ind_list = ind_list[1:]

        states = []
        previous_ind = -1
        for ind in ind_list:
            if ind > previous_ind:
                states.append(block_text[ind: index_dict[ind]+1])
                previous_ind = index_dict[ind]

        return states

def create_ontology(domain_text, problem_text):
    parser = PDDLParser(domain_text, problem_text)
    json_data = parser.run()

    OWL_URL = "https://raw.githubusercontent.com/BharathMuppasani/AI-Planning-Ontology/main/models/plan-ontology-rdf-ESWC.owl"
    # Required for the plugin
    owl_content = pyodide.http.open_url(OWL_URL)
    owl_content = owl_content.read()
    
    g = Graph()
    g.parse(data=owl_content, format="xml")
    
    builder = OntologyBuilder(g)
    return builder.build_from_dict(json_data)