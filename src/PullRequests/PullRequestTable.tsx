import React from 'react';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { getResponse } from "../GitHub/Api";
import { Avatar, AvatarGroup, Badge, Chip, Link } from "@mui/material";
import TimeAgo from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import JiraLink from "./JiraLink";

TimeAgo.addDefaultLocale(en)
let timeAgo = new TimeAgo();

export interface PullRequestTableProps {
  selectedRepositories: any,
  selectedLabels: any
}

const columns: GridColDef[] = [
  {
    field: 'title',
    headerName: 'Title',
    flex: 4,
    renderCell: params => (
      <div>
        <Link href={params.getValue(params.id, 'link') as string}
              target={'_blank'}
              underline={'hover'}>
          {params.value}
        </Link>
        <span>
          {
            (params.getValue(params.id, 'labels') as any).map((label: any) => {
              const style = {
                backgroundColor: '#' + label.color,
                marginLeft: '3px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600
              }
              return (<Chip label={label.name} size="small" style={style} sx={{height: 18}}/>)
            })
          }
        </span>
      </div>
    )
  },
  {
    field: 'author',
    headerName: 'Author',
    flex: 1,
    renderCell: params => (
      <Link href={'https://github.com/' + params.value} target={'_blank'} underline={'hover'}>
        <Chip
          avatar={<Avatar
            alt={params.value as string}
            src={params.getValue(params.id, 'avatarUrl') as string}
            sx={{width: 26, height: 26}}
          />}
          label={params.value}
          variant="outlined"
        />
      </Link>
    )
  },
  {field: 'createdAt', headerName: 'Created At', width: 120},
  {
    field: 'repository',
    headerName: 'Repository',
    flex: 1,
    renderCell: params => (
      <Link href={'https://github.com/BrandEmbassy/' + params.value} target={'_blank'} underline={'hover'}>
        {params.value}
      </Link>
    )
  },
  {
    field: 'assignees',
    headerName: 'Assignees',
    flex: 0.8,
    renderCell: (params: GridRenderCellParams) => (
      <div>
        <AvatarGroup>
          {
            (params.value as any).map((user: any) => {
              return (<Avatar alt={user.login} src={user.avatar_url} sx={{width: 26, height: 26}}/>)
            })
          }
        </AvatarGroup>
      </div>
    ),
  },
  {
    field: 'comments',
    headerName: 'Comments',
    flex: 0.5,
    renderCell: params => (
      <Badge badgeContent={params.getValue(params.id, 'comments')} color="primary" showZero>
        <QuestionAnswerIcon color="disabled"/>
      </Badge>
    )
  },
  {
    field: 'jira',
    headerName: 'JIRA',
    sortable: false,
    flex: 0.5,
    renderCell: params => (
      <JiraLink prTitle={params.getValue(params.id, 'title') as string}/>
    )
  },
];

export default function PullRequestTable(props: PullRequestTableProps) {

  const [rows, setRows] = React.useState([])
  const [repositoryFetched, setRepositoryFetched] = React.useState([]);

  const loadPullRequests = async (): Promise<void> => {
    let filters = ''

    props.selectedRepositories.forEach((repository: any) => (
      filters += ' repo:BrandEmbassy/' + repository
    ))

    props.selectedLabels.forEach((label: any) => (
      filters += ' label:"' + label + '"'
    ))

    if (filters === '') {
      filters = ' org:BrandEmbassy'
    }

    const pullRequestsData = await getResponse('/search/issues?q=' + encodeURIComponent('is:pr is:open ' + filters))

    setRows(pullRequestsData.items.map((pr: any) => ({
      id: pr.number,
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      labels: pr.labels,
      link: pr.html_url,
      repository: pr.repository_url.split('/').pop(),
      avatarUrl: pr.user.avatar_url,
      createdAt: timeAgo.format(new Date(pr.created_at)),
      assignees: pr.assignees,
      comments: pr.comments
    })));
    setRepositoryFetched(props.selectedRepositories)
  }

  React.useEffect(() => {
    if (repositoryFetched !== props.selectedRepositories) {
      loadPullRequests()
    }
  });

  return (
    <div style={{display: 'flex', marginBottom: '20px'}}>
      <DataGrid
        rows={rows}
        columns={columns}
        disableColumnFilter
        disableColumnMenu
        hideFooter
        autoHeight
        disableSelectionOnClick/>
    </div>
  );
}